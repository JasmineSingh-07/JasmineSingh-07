require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const { User, Room, Session } = require('./models');

process.on('unhandledRejection', e => console.error('Unhandled rejection:', e));
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const app = express();
app.set('trust proxy', 1);
const srv = http.createServer(app);
const io = new Server(srv);
const W = 1000, H = 700; // virtual room size
const COLORS = ['#ff7a3d', '#8ef0c8', '#ffd166', '#ff9ecb', '#b8f26b', '#f5a3ff'];
const live = new Map();  // roomId -> Map(socketId -> { name, x, y, color, speaking, muted })
const dirty = new Set(); // rooms whose state changed since the last tick
const clamp = (v, a, b) => Math.min(b, Math.max(a, +v || 0));
const sign = u => jwt.sign({ id: u.id, name: u.name }, SECRET, { expiresIn: '7d' });
const h = fn => (req, res) => fn(req, res).catch(() => res.status(400).json({ error: 'Bad request.' }));
const auth = (req, res, next) => {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Session expired. Log in again.' }); }
};
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });

app.use(express.json({ limit: '10kb' }));

// ---- Accounts ----
app.post('/api/auth/register', authLimit, h(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!String(name || '').trim() || !/^\S+@\S+\.\S+$/.test(email || '') || String(password || '').length < 6)
    return res.status(400).json({ error: 'Enter a name, a valid email and a password of at least 6 characters.' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'That email is already registered. Log in instead.' });
  const u = await User.create({ name: String(name).trim().slice(0, 20), email, pass: await bcrypt.hash(password, 10) });
  res.json({ token: sign(u), user: { id: u.id, name: u.name } });
}));
app.post('/api/auth/login', authLimit, h(async (req, res) => {
  const u = await User.findOne({ email: String(req.body?.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.pass))) return res.status(401).json({ error: 'Wrong email or password.' });
  res.json({ token: sign(u), user: { id: u.id, name: u.name } });
}));

// ---- WebRTC ICE servers (STUN, plus TURN when configured in the environment) ----
app.get('/api/ice', auth, (req, res) => {
  const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.TURN_URL) iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USER, credential: process.env.TURN_PASS });
  res.json({ iceServers });
});

// ---- Rooms ----
app.get('/api/rooms', auth, h(async (req, res) => {
  const rooms = await Room.find().sort('createdAt').lean();
  res.json(rooms.map(r => ({ _id: r._id, name: r.name, radius: r.radius, locked: !!r.pass, mine: String(r.owner) === req.user.id, online: (live.get(String(r._id)) || new Map()).size })));
}));
app.post('/api/rooms', auth, h(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 30);
  if (!name) return res.status(400).json({ error: 'Give the room a name.' });
  if (await Room.findOne({ name })) return res.status(409).json({ error: 'A room with that name already exists.' });
  const pass = req.body.password ? await bcrypt.hash(String(req.body.password).slice(0, 50), 8) : '';
  res.json(await Room.create({ name, radius: clamp(req.body.radius || 250, 80, 5000), owner: req.user.id, pass }));
}));
app.delete('/api/rooms/:id', auth, h(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found.' });
  if (String(room.owner) !== req.user.id) return res.status(403).json({ error: 'Only the host can delete this room.' });
  const id = String(room._id);
  io.to(id).emit('kicked', { reason: 'The host deleted this room.' });
  io.in(id).socketsLeave(id); live.delete(id);
  await room.deleteOne(); res.json({ ok: true });
}));
app.get('/api/rooms/:id/sessions', auth, h(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room || String(room.owner) !== req.user.id) return res.status(403).json({ error: 'Only the host can view sessions.' });
  res.json(await Session.find({ room: room._id }).sort('-joinedAt').limit(100));
}));

// ---- Real-time: presence, coordinates, chat, moderation, WebRTC signalling ----
io.use((s, next) => {
  try { s.user = jwt.verify(String(s.handshake.auth?.token || ''), SECRET); next(); }
  catch { next(new Error('auth')); }
});

async function leaveRoom(s) {
  const { roomId, sid } = s.data || {};
  if (!roomId) return;
  live.get(roomId)?.delete(s.id); s.leave(roomId); dirty.add(roomId); s.data = {};
  if (sid) await Session.findByIdAndUpdate(sid, { leftAt: new Date() }).catch(() => {});
}

io.on('connection', s => {
  s.on('join', async ({ roomId, password } = {}, ack) => {
    if (typeof ack !== 'function') return;
    try {
      const room = await Room.findById(roomId);
      if (!room) return ack({ error: 'Room not found.' });
      if (room.pass && !(await bcrypt.compare(String(password || ''), room.pass))) return ack({ error: 'Wrong room password.' });
      await leaveRoom(s);
      const id = String(room._id), m = live.get(id) || new Map(); live.set(id, m);
      const me = { name: s.user.name, x: 100 + Math.random() * (W - 200), y: 100 + Math.random() * (H - 200), color: COLORS[m.size % COLORS.length], speaking: false, muted: false };
      m.set(s.id, me); s.join(id);
      const owner = String(room.owner) === s.user.id;
      s.data = { roomId: id, owner, radius: room.radius, sid: (await Session.create({ room: room._id, user: s.user.id, name: me.name }))._id };
      ack({ id: s.id, color: me.color, radius: room.radius, w: W, h: H, room: room.name, owner });
      dirty.add(id);
    } catch { ack({ error: 'Could not join the room.' }); }
  });
  s.on('move', ({ x, y } = {}) => {
    const me = live.get(s.data?.roomId)?.get(s.id);
    if (!me) return;
    me.x = clamp(x, 0, W); me.y = clamp(y, 0, H); dirty.add(s.data.roomId);
  });
  s.on('speak', v => {
    const me = live.get(s.data?.roomId)?.get(s.id);
    if (!me || me.speaking === !!v) return;
    me.speaking = !!v && !me.muted; dirty.add(s.data.roomId);
  });
  // Proximity chat: only people inside the sender's hearing radius receive it
  s.on('chat', text => {
    const { roomId, radius } = s.data || {}, m = live.get(roomId), me = m?.get(s.id);
    text = String(text || '').trim().slice(0, 300);
    if (!me || !text || Date.now() - (s.lastChat || 0) < 500) return;
    s.lastChat = Date.now();
    for (const [id, o] of m) if (Math.hypot(o.x - me.x, o.y - me.y) <= radius) io.to(id).emit('chat', { from: me.name, color: me.color, text, t: Date.now() });
  });
  // Host controls
  s.on('mod', ({ action, target } = {}) => {
    const { roomId, owner } = s.data || {}, tgt = live.get(roomId)?.get(target);
    if (!owner || !tgt || target === s.id) return;
    if (action === 'kick') { io.to(target).emit('kicked', { reason: 'The host removed you from the room.' }); const ts = io.sockets.sockets.get(target); if (ts) leaveRoom(ts); }
    else if (action === 'mute') { tgt.muted = !tgt.muted; if (tgt.muted) tgt.speaking = false; io.to(target).emit('muted', tgt.muted); dirty.add(roomId); }
  });
  s.on('sig', ({ to, data } = {}) => io.to(to).emit('sig', { from: s.id, data }));
  s.on('disconnect', () => leaveRoom(s));
});
// Broadcast room state ~15 times a second, only for rooms that changed
setInterval(() => {
  for (const id of dirty) io.to(id).emit('state', [...(live.get(id) || new Map())].map(([k, v]) => ({ id: k, ...v })));
  dirty.clear();
}, 66);

app.use(express.static(path.join(__dirname, '../dist')));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/proxispeak')
  .then(async () => {
    if (!(await Room.countDocuments())) await Room.create({ name: 'Lobby', radius: 250 });
    srv.listen(process.env.PORT || 3000, () => console.log('ProxiSpeak API on http://localhost:' + (process.env.PORT || 3000)));
  })
  .catch(e => { console.error('MongoDB connection failed:', e.message, '\nStart MongoDB or set MONGO_URI in .env (see README).'); process.exit(1); });
