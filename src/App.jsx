import { useEffect, useRef, useState } from 'react';
import { useVoice } from './useVoice';
import Stage from './Stage';

const api = async (p, o = {}, token) => {
  const r = await fetch(p, {
    method: o.method || (o.body ? 'POST' : 'GET'), body: o.body && JSON.stringify(o.body),
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || 'Request failed'); e.status = r.status; throw e; }
  return j;
};
const Rings = () => (
  <div className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
    <i className="ring-i" /><i className="ring-i [animation-delay:1.5s] !border-mint" /><i className="ring-i [animation-delay:3s]" /><i className="ring-i [animation-delay:4.5s] !border-mint" />
  </div>
);

function Auth({ onDone }) {
  const [mode, setMode] = useState('register'), [f, setF] = useState({ name: '', email: '', password: '' }), [err, setErr] = useState('');
  const reg = mode === 'register', set = k => e => setF({ ...f, [k]: e.target.value });
  const go = async () => {
    try { setErr(''); const r = await api('/api/auth/' + mode, { body: f }); onDone({ token: r.token, user: r.user }); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="relative grid h-screen place-items-center overflow-y-auto">
      <Rings />
      <div className="relative grid w-[min(460px,90vw)] gap-4 py-8">
        <h1 className="text-[clamp(44px,10vw,76px)] font-extrabold leading-[.92] tracking-[-3px]">Talk to whoever is near.</h1>
        <p className="leading-relaxed text-dim">Step into a room, move around, and hear people by how close they are. Walk away and their voice fades out.</p>
        {reg && <input className="field" value={f.name} onChange={set('name')} maxLength={20} placeholder="Your name" aria-label="Your name" />}
        <input className="field" type="email" value={f.email} onChange={set('email')} placeholder="Email" aria-label="Email" />
        <input className="field" type="password" value={f.password} onChange={set('password')} onKeyDown={e => e.key === 'Enter' && go()} placeholder="Password (6+ characters)" aria-label="Password" />
        <button className="btn" onClick={go}>{reg ? 'Create account' : 'Log in'}</button>
        <button className="text-sm text-dim underline" onClick={() => { setMode(reg ? 'login' : 'register'); setErr(''); }}>{reg ? 'I already have an account' : 'Create a new account'}</button>
        <div className="min-h-5 text-sm text-tan">{err}</div>
      </div>
    </div>
  );
}

function Lobby({ auth, v, logout }) {
  const { token, user } = auth;
  const [rooms, setRooms] = useState([]), [pw, setPw] = useState(''), [err, setErr] = useState('');
  const [nf, setNf] = useState({ name: '', radius: 250, password: '', meeting: false });
  const fail = e => { if (e.status === 401) logout(); else setErr(e.message); };
  const load = () => api('/api/rooms', {}, token).then(setRooms).catch(fail);
  useEffect(() => { load(); }, []);

  const enter = async r => {
    try { setErr(''); const { iceServers } = await api('/api/ice', {}, token); await v.join(r._id, pw, iceServers); }
    catch (e) { e.status === 401 ? logout() : setErr(e.name === 'NotAllowedError' ? 'Microphone blocked. Allow it in the address bar and try again.' : e.message); }
  };
  const create = async () => {
    try { setErr(''); await api('/api/rooms', { body: { name: nf.name, radius: nf.meeting ? 5000 : +nf.radius, password: nf.password } }, token); setNf({ name: '', radius: 250, password: '', meeting: false }); load(); }
    catch (e) { fail(e); }
  };
  const del = async r => { try { await api('/api/rooms/' + r._id, { method: 'DELETE' }, token); load(); } catch (e) { fail(e); } };

  return (
    <div className="relative grid h-screen place-items-center overflow-y-auto">
      <Rings />
      <div className="relative grid w-[min(520px,92vw)] gap-4 py-8">
        <div className="flex items-center justify-between"><h1 className="text-4xl font-extrabold tracking-tight">Rooms</h1>
          <span className="text-sm text-dim">Hi {user.name}. <button className="underline" onClick={logout}>Log out</button></span></div>
        {v.notice && <div className="rounded-2xl bg-plum2 p-3 text-sm text-tan">{v.notice}</div>}
        <input className="field" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="Room password (only for locked rooms)" aria-label="Room password" />
        <div className="grid gap-2">
          {rooms.map(r => (
            <div key={r._id} className="flex gap-2">
              <button onClick={() => enter(r)} className="btn btn-alt flex items-center justify-between text-left">
                <span>{r.locked ? 'Locked: ' : ''}{r.name}</span>
                <span className="text-sm font-normal text-dim">{r.online} here, {r.radius >= 2000 ? 'meeting mode' : 'range ' + r.radius + ' m'}</span>
              </button>
              {r.mine && <button className="btn btn-alt !flex-none" onClick={() => del(r)} aria-label={'Delete room ' + r.name}>Delete</button>}
            </div>
          ))}
        </div>
        <div className="grid gap-2 rounded-3xl bg-plum2 p-4">
          <h2 className="font-semibold text-dim">Create a room</h2>
          <div className="flex gap-2">
            <input className="field" value={nf.name} onChange={e => setNf({ ...nf, name: e.target.value })} placeholder="Room name" aria-label="Room name" />
            <input className="field !w-24" type="number" min="80" max="600" disabled={nf.meeting} value={nf.radius} onChange={e => setNf({ ...nf, radius: e.target.value })} aria-label="Hearing range in metres" />
          </div>
          <input className="field" type="password" value={nf.password} onChange={e => setNf({ ...nf, password: e.target.value })} placeholder="Password (optional, makes it private)" aria-label="Room password" />
          <label className="flex items-center gap-2.5 text-sm text-dim"><input type="checkbox" className="accent-tan" checked={nf.meeting} onChange={e => setNf({ ...nf, meeting: e.target.checked })} />Meeting mode: everyone in the room hears everyone (best for 6 people or fewer)</label>
          <button className="btn" onClick={create}>Create room</button>
        </div>
        <div className="min-h-5 text-sm text-tan">{err}</div>
      </div>
    </div>
  );
}

function Room({ v }) {
  const { info, members, conn, chat } = v;
  const [dir, setDir] = useState(false), [msg, setMsg] = useState(''), end = useRef();
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [chat]);
  const me = members.find(m => m.id === info.id);
  const others = members.filter(m => m.id !== info.id).map(o => ({ ...o, d: me ? Math.round(Math.hypot(o.x - me.x, o.y - me.y)) : 0 })).sort((a, b) => a.d - b.d);
  const send = () => { if (msg.trim()) { v.sendChat(msg); setMsg(''); } };
  return (
    <div className="flex h-screen flex-col-reverse md:flex-row">
      <aside className="z-10 flex h-[55%] w-full flex-col gap-3 overflow-y-auto border-line bg-plum2 p-5 md:h-full md:w-[360px] md:border-r-2">
        <h1 className="text-[28px] font-extrabold tracking-tight">ProxiSpeak</h1>
        <div className="flex items-center gap-2 text-sm text-dim"><i className={'h-2.5 w-2.5 flex-none rounded-full ' + (v.online ? 'bg-mint' : 'bg-tan')} />
          {v.online ? `${info.room}, ${info.radius >= 2000 ? 'meeting mode' : 'range ' + info.radius + ' m'}` : 'Connection lost. Reconnecting...'}</div>
        {v.hostMuted && <div className="rounded-xl bg-plum p-2 text-sm text-tan">The host muted you.</div>}
        <div className="flex gap-2.5">
          <button className={'btn btn-alt ' + (v.muted ? 'btn-on' : '')} onClick={v.toggleMute}>{v.muted ? 'Muted' : 'Mic on'}</button>
          <button className="btn btn-alt" onClick={v.leave}>Leave room</button>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-dim"><input type="checkbox" className="accent-tan" checked={v.ptt} onChange={e => v.setPtt(e.target.checked)} />Push to talk (hold Space)</label>
        <label className="flex items-center gap-2.5 text-sm text-dim"><input type="checkbox" className="accent-tan" checked={dir} onChange={e => { setDir(e.target.checked); v.setDirectional(e.target.checked); }} />Directional audio (hear left and right)</label>
        <h2 className="text-[15px] font-semibold text-dim">{others.length ? `In this room (${others.length})` : 'In this room'}</h2>
        <div className="grid gap-2">
          {others.map(o => {
            const inR = o.d <= info.radius, st = conn[o.id];
            const lbl = o.speaking ? 'speaking' : !inR ? 'out of range' : st === 'connected' ? 'connected' : st === 'failed' ? 'blocked by network' : 'connecting';
            return (
              <div key={o.id} className={'grid grid-cols-[14px_1fr_auto] items-center gap-3 rounded-2xl bg-plum px-3.5 py-2.5 ' + (inR ? '' : 'opacity-50')}>
                <i className={'h-3.5 w-3.5 rounded-full ' + (o.speaking ? 'ring-2 ring-mint ring-offset-2 ring-offset-plum' : '')} style={{ background: o.color }} />
                <div><b className="block font-semibold">{o.name}{o.muted ? ' (muted)' : ''}</b><small className="text-dim">{o.d} m away, {lbl}</small></div>
                {info.owner && <div className="flex gap-1.5 text-xs">
                  <button className="rounded-lg border border-line px-2 py-1" onClick={() => v.mod('mute', o.id)}>{o.muted ? 'Unmute' : 'Mute'}</button>
                  <button className="rounded-lg border border-line px-2 py-1 text-tan" onClick={() => v.mod('kick', o.id)}>Kick</button>
                </div>}
              </div>
            );
          })}
          {!others.length && <p className="text-sm leading-relaxed text-dim">You are alone. Open this page in another browser, log in as someone else, and join the same room.</p>}
        </div>
        <h2 className="text-[15px] font-semibold text-dim">Nearby chat</h2>
        <div className="max-h-40 min-h-16 overflow-y-auto rounded-2xl bg-plum p-3 text-sm" aria-live="polite">
          {chat.length ? chat.map((m, i) => <p key={i}><b style={{ color: m.color }}>{m.from}</b> {m.text}</p>) : <p className="text-dim">Messages reach only people in range.</p>}
          <div ref={end} />
        </div>
        <div className="flex gap-2"><input className="field !py-2" value={msg} maxLength={300} onChange={e => setMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message people nearby" aria-label="Chat message" /><button className="btn !flex-none !py-2" onClick={send}>Send</button></div>
        <p className="mt-auto text-sm text-dim">Move with WASD or arrow keys, or click or tap the floor.</p>
      </aside>
      <main className="min-h-0 flex-1"><Stage info={info} members={members} onMove={v.move} /></main>
    </div>
  );
}

export default function App() {
  const [auth, setAuth] = useState(() => { try { return JSON.parse(localStorage.getItem('pa')); } catch { return null; } });
  const v = useVoice(auth?.token);
  const login = a => { localStorage.setItem('pa', JSON.stringify(a)); setAuth(a); };
  const logout = () => { v.leave(); localStorage.removeItem('pa'); setAuth(null); };
  if (!auth) return <Auth onDone={login} />;
  return v.info ? <Room v={v} /> : <Lobby auth={auth} v={v} logout={logout} />;
}
