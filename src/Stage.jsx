import { useEffect, useRef } from 'react';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// HTML Canvas room: virtual coordinates, WASD/arrow keys or click-to-move, hearing radius drawn around you
export default function Stage({ info, members, onMove }) {
  const cv = useRef(), mem = useRef(members), L = useRef({ s: 1, ox: 0, oy: 0, d: 1 });
  const S = useRef({ x: null, y: null, tx: null, ty: null, keys: {}, sent: 0 });
  mem.current = members;

  useEffect(() => {
    const c = cv.current, g = c.getContext('2d'), st = S.current, { w: W, h: H, radius: R } = info;
    st.x = null; st.y = null; let raf, last = performance.now();
    const fit = () => {
      const r = c.parentElement.getBoundingClientRect(), d = devicePixelRatio || 1;
      c.width = r.width * d; c.height = r.height * d; c.style.width = r.width + 'px'; c.style.height = r.height + 'px';
      const s = Math.min(r.width / W, r.height / H) * 0.94;
      L.current = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, d };
    };
    fit(); addEventListener('resize', fit);
    const keys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
    const kd = e => { const k = e.key.toLowerCase(); if (!keys.includes(k) || document.activeElement.tagName === 'INPUT') return; st.keys[k] = 1; st.tx = null; e.preventDefault(); };
    const ku = e => delete st.keys[e.key.toLowerCase()];
    addEventListener('keydown', kd); addEventListener('keyup', ku);
    c.onpointerdown = e => {
      const { s, ox, oy } = L.current, r = c.getBoundingClientRect();
      st.tx = clamp((e.clientX - r.left - ox) / s, 0, W); st.ty = clamp((e.clientY - r.top - oy) / s, 0, H);
    };

    const label = (t, x, y, a = 1) => { g.globalAlpha = a; g.fillStyle = '#ffd8bd'; g.font = '600 14px "Bricolage Grotesque", sans-serif'; g.textAlign = 'center'; g.fillText(t, x, y); g.globalAlpha = 1; };
    const dot = (x, y, r, col, a = 1) => { g.globalAlpha = a; g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = '#2b0f33'; g.stroke(); g.globalAlpha = 1; };

    const ring = (x, y, t) => { g.beginPath(); g.arc(x, y, 26 + 4 * Math.sin(t / 120), 0, 7); g.lineWidth = 3; g.strokeStyle = '#8ef0c8'; g.stroke(); };

    const loop = t => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const me = mem.current.find(m => m.id === info.id);
      if (st.x === null && me) { st.x = me.x; st.y = me.y; }
      if (st.x !== null) {
        let vx = (st.keys.d || st.keys.arrowright ? 1 : 0) - (st.keys.a || st.keys.arrowleft ? 1 : 0);
        let vy = (st.keys.s || st.keys.arrowdown ? 1 : 0) - (st.keys.w || st.keys.arrowup ? 1 : 0);
        if (!vx && !vy && st.tx !== null) {
          const dx = st.tx - st.x, dy = st.ty - st.y, l = Math.hypot(dx, dy);
          if (l < 4) st.tx = null; else { vx = dx / l; vy = dy / l; }
        }
        if (vx || vy) {
          const l = Math.hypot(vx, vy);
          st.x = clamp(st.x + (vx / l) * 240 * dt, 0, W); st.y = clamp(st.y + (vy / l) * 240 * dt, 0, H);
          if (t - st.sent > 60) { st.sent = t; onMove(st.x, st.y); }
        }
      }
      const { s, ox, oy, d } = L.current;
      g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, c.width, c.height);
      g.save(); g.translate(ox, oy); g.scale(s, s);
      g.fillStyle = '#34163d'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(95,52,112,.55)'; g.lineWidth = 1;
      for (let x = 0; x <= W; x += 50) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
      for (let y = 0; y <= H; y += 50) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
      g.strokeStyle = '#5f3470'; g.lineWidth = 4; g.strokeRect(0, 0, W, H);
      if (st.x !== null) {
        g.beginPath(); g.arc(st.x, st.y, R, 0, 7); g.fillStyle = 'rgba(142,240,200,.08)'; g.fill();
        g.setLineDash([12, 10]); g.lineWidth = 2; g.strokeStyle = '#8ef0c8'; g.stroke(); g.setLineDash([]);
        mem.current.forEach(o => {
          if (o.id === info.id) return;
          const dd = Math.hypot(o.x - st.x, o.y - st.y), inR = dd <= R;
          if (inR) { g.globalAlpha = 0.25 + 0.6 * (1 - dd / R); g.strokeStyle = o.color; g.lineWidth = 3; g.beginPath(); g.moveTo(st.x, st.y); g.lineTo(o.x, o.y); g.stroke(); g.globalAlpha = 1; }
          if (o.speaking) ring(o.x, o.y, t); dot(o.x, o.y, 15, o.color, inR ? 1 : 0.35); label(o.name, o.x, o.y - 24, inR ? 1 : 0.5);
        });
        if (me?.speaking) ring(st.x, st.y, t); dot(st.x, st.y, 18, info.color); label((me?.name || 'You') + ' (you)', st.x, st.y - 28);
      }
      g.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); removeEventListener('keydown', kd); removeEventListener('keyup', ku); };
  }, [info]);

  return <canvas ref={cv} className="block touch-none cursor-crosshair" aria-label="Room map. Move with WASD, arrow keys or by clicking." />;
}
