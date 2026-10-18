import { useRef, useState } from 'react';
import { io } from 'socket.io-client';

// Socket presence + WebRTC mesh + Web Audio (GainNode distance volume, PannerNode direction),
// speaking detection, push-to-talk, proximity chat, host controls and auto-rejoin after a dropped connection.
export function useVoice(token) {
  const R = useRef({ peers: {}, radius: 250, dir: false }).current;
  const [info, setInfo] = useState(null), [members, setMembers] = useState([]), [conn, setConn] = useState({});
  const [chat, setChat] = useState([]), [notice, setNotice] = useState('');
  const [muted, setMuted] = useState(false), [ptt, setPttS] = useState(false), [hostMuted, setHostMuted] = useState(false), [online, setOnline] = useState(true);

  const applyMic = () => R.stream?.getAudioTracks().forEach(t => (t.enabled = !R.muted && !R.host && (!R.ptt || !!R.space)));
  const audio = p => {
    if (!p.gain) return;
    p.gain.gain.value = Math.max(0.08, 1 - p.d / R.radius);
    p.pan.positionX.value = R.dir ? p.dx / 100 : 0;
    p.pan.positionZ.value = R.dir ? p.dy / 100 : 0; // listener faces -z, so "up" on the canvas is in front
  };
  const drop = id => { R.peers[id]?.pc.close(); delete R.peers[id]; setConn(c => { const n = { ...c }; delete n[id]; return n; }); };

  const mk = (id, init) => {
    const pc = new RTCPeerConnection(R.ice), p = (R.peers[id] = { pc, d: 0, dx: 0, dy: 0 });
    if (init) pc.onnegotiationneeded = async () => {
      await pc.setLocalDescription(await pc.createOffer());
      R.socket.emit('sig', { to: id, data: { sdp: pc.localDescription } });
    };
    pc.onicecandidate = e => e.candidate && R.socket.emit('sig', { to: id, data: { ice: e.candidate } });
    pc.onconnectionstatechange = () => setConn(c => ({ ...c, [id]: pc.connectionState }));
    pc.ontrack = e => {
      const st = e.streams[0];
      p.audio = new Audio(); p.audio.srcObject = st; p.audio.muted = true; // keeps the stream flowing in Chrome
      p.gain = R.ctx.createGain();
      p.pan = R.ctx.createPanner(); p.pan.panningModel = 'equalpower'; p.pan.rolloffFactor = 0; // volume handled by the GainNode
      R.ctx.createMediaStreamSource(st).connect(p.gain).connect(p.pan).connect(R.ctx.destination);
      audio(p);
    };
    R.stream.getTracks().forEach(t => pc.addTrack(t, R.stream));
    return p;
  };
  const onSig = async ({ from, data }) => {
    const pc = (R.peers[from] || mk(from, false)).pc;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') { await pc.setLocalDescription(await pc.createAnswer()); R.socket.emit('sig', { to: from, data: { sdp: pc.localDescription } }); }
    } else if (data.ice) { try { await pc.addIceCandidate(data.ice); } catch {} }
  };
  // Connect to people inside the room radius, disconnect from people who left it
  const onState = list => {
    setMembers(list);
    const me = list.find(m => m.id === R.socket.id);
    if (!me) return;
    const ids = new Set(list.map(m => m.id));
    Object.keys(R.peers).forEach(id => !ids.has(id) && drop(id));
    list.forEach(o => {
      if (o.id === me.id) return;
      const dx = o.x - me.x, dy = o.y - me.y, d = Math.hypot(dx, dy);
      if (d <= R.radius && !R.peers[o.id]) mk(o.id, me.id < o.id);
      else if (d > R.radius * 1.08 && R.peers[o.id]) return drop(o.id);
      const p = R.peers[o.id];
      if (p) { p.d = d; p.dx = dx; p.dy = dy; audio(p); }
    });
  };

  const cleanup = () => {
    clearInterval(R.meter); removeEventListener('keydown', R.kd); removeEventListener('keyup', R.ku);
    Object.keys(R.peers).forEach(drop);
    R.stream?.getTracks().forEach(t => t.stop()); R.socket?.disconnect(); R.ctx?.close().catch(() => {});
    R.first = false; R.talking = false; R.muted = false; R.host = false; R.ptt = false; R.space = false;
    setMembers([]); setConn({}); setChat([]); setInfo(null); setOnline(true); setHostMuted(false); setMuted(false); setPttS(false);
  };
  const emitJoin = () => new Promise((ok, no) => {
    const t = setTimeout(() => no(new Error('Could not reach the server. Check your connection.')), 8000);
    R.socket.emit('join', { roomId: R.roomId, password: R.password }, r => { clearTimeout(t); r.error ? no(new Error(r.error)) : ok(r); });
  });

  const join = async (roomId, password, ice) => {
    setNotice(''); Object.assign(R, { roomId, password, ice: { iceServers: ice } });
    R.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    R.ctx = new AudioContext(); await R.ctx.resume();
    const an = R.ctx.createAnalyser(); an.fftSize = 512; R.ctx.createMediaStreamSource(R.stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    R.meter = setInterval(() => { // speaking indicator: tell the room when your mic level goes above a threshold
      an.getByteTimeDomainData(buf); let s = 0; for (const b of buf) s += ((b - 128) / 128) ** 2;
      const talking = Math.sqrt(s / buf.length) > 0.04 && R.stream.getAudioTracks()[0].enabled;
      if (talking !== R.talking) { R.talking = talking; R.socket?.emit('speak', talking); }
    }, 120);
    R.kd = e => { if (e.code === 'Space' && R.ptt && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { R.space = true; applyMic(); e.preventDefault(); } };
    R.ku = e => { if (e.code === 'Space') { R.space = false; applyMic(); } };
    addEventListener('keydown', R.kd); addEventListener('keyup', R.ku);

    const s = (R.socket = io({ auth: { token } }));
    s.on('state', onState); s.on('sig', onSig);
    s.on('chat', m => setChat(c => [...c.slice(-49), m]));
    s.on('muted', v => { R.host = v; setHostMuted(v); applyMic(); });
    s.on('kicked', ({ reason }) => { cleanup(); setNotice(reason); });
    s.on('disconnect', () => setOnline(false));
    s.on('connect', async () => { // reconnect: drop stale peers and re-enter the room under the new socket id
      if (!R.first) { R.first = true; return; }
      Object.keys(R.peers).forEach(drop);
      try { const i = await emitJoin(); R.radius = i.radius; setInfo(i); setOnline(true); }
      catch (e) { cleanup(); setNotice(e.message); }
    });
    try { const i = await emitJoin(); R.radius = i.radius; setInfo(i); applyMic(); }
    catch (e) { cleanup(); throw e; }
  };

  return {
    info, members, conn, chat, notice, muted, ptt, hostMuted, online, join, leave: cleanup,
    move: (x, y) => R.socket?.emit('move', { x, y }),
    sendChat: t => R.socket?.emit('chat', t),
    mod: (action, target) => R.socket?.emit('mod', { action, target }),
    toggleMute: () => { R.muted = !R.muted; setMuted(R.muted); applyMic(); },
    setPtt: v => { R.ptt = v; setPttS(v); applyMic(); },
    setDirectional: v => { R.dir = v; Object.values(R.peers).forEach(audio); },
  };
}
