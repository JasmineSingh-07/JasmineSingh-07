# 🎙️ ProxiSpeak

> **Spatial voice chat — walk around a virtual room and talk to the people near you. Volume fades with distance.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Socket.io](https://img.shields.io/badge/Socket.io-realtime-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?style=flat-square&logo=mongodb&logoColor=white)](https://mongodb.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

---

## ✨ What is ProxiSpeak?

ProxiSpeak is a **geospatial proximity audio ecosystem** — a browser-based virtual space where users move freely on a 2D canvas and communicate via live voice. Audio volume and direction change dynamically based on how close you are to other participants, creating a natural, immersive conversation experience without ever leaving your browser.

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18 + Tailwind CSS (Vite) |
| **Spatial View** | HTML Canvas with virtual 2D coordinates |
| **Realtime Server** | Node.js, Express, Socket.io (presence, coordinates, chat, moderation, WebRTC signalling) |
| **Voice** | WebRTC peer-to-peer connections (never stored or recorded) |
| **Spatial Audio** | Web Audio API — `GainNode` (distance) + `PannerNode` (direction) |
| **Persistence** | MongoDB — users, rooms, session metadata |

---

## 🚀 Features

- 🔐 **Accounts** — JWT authentication with bcrypt password hashing
- 🔒 **Password-protected rooms** — keep your space private
- 👑 **Host controls** — mute, kick participants, or delete a room
- 🎤 **Push-to-talk** — hold a key to speak
- 📡 **Proximity text chat** — message nearby participants
- 🔊 **Directional spatial audio** — hear who's on your left or right
- 🔄 **Auto-rejoin** — seamlessly reconnects after a dropped connection
- 🌐 **TURN support** — for participants behind strict NAT/firewalls
- 🛡️ **Rate limiting** — brute-force protection on login
- 📱 **Mobile friendly** — touch/click-to-move support

---

## 🖥️ Run Locally

1. **Prerequisites:** Node.js 18+ and MongoDB (or a free [MongoDB Atlas](https://mongodb.com/atlas) URI).

2. **Clone & configure:**
   ```bash
   git clone https://github.com/JasmineSingh-07/proxispeak.git
   cd proxispeak
   cp .env.example .env
   # Edit .env — set MONGO_URI and a long random JWT_SECRET
   ```

3. **Install & run:**
   ```bash
   npm install
   npm run dev
   ```

4. Open **http://localhost:5173** in two different browsers (with different accounts), join the same room and walk toward each other!

---

## ☁️ Deploy on Render (Free)

1. Create a free [MongoDB Atlas](https://mongodb.com/atlas) cluster and copy the connection string (allow network access from anywhere `0.0.0.0/0`).
2. Push this repo to GitHub. In [Render](https://render.com), choose **New → Blueprint** and select this repo — it reads `render.yaml` automatically.
3. Set the environment variable `MONGO_URI`. Optionally add `TURN_URL`, `TURN_USER`, `TURN_PASS` from a hosted TURN service. `JWT_SECRET` is auto-generated.
4. Open your Render URL — HTTPS is provided out of the box (required for microphone access).

> **Note:** The free Render plan sleeps when idle, so the first load after inactivity may be slow.

---

## 📡 REST API

All protected routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register a new account |
| `POST` | `/api/auth/login` | Login and receive a JWT |
| `GET` | `/api/ice` | Get ICE / TURN server config |
| `GET` | `/api/rooms` | List all rooms |
| `POST` | `/api/rooms` | Create a new room |
| `DELETE` | `/api/rooms/:id` | Delete a room (host only) |
| `GET` | `/api/rooms/:id/sessions` | Get session history for a room |

---

## ⚠️ Known Limits

Voice uses a **peer-to-peer mesh**, so rooms work best with up to **~6 simultaneous speakers**. For larger rooms, an SFU such as [LiveKit](https://livekit.io) would be needed.

---

## 📄 License

MIT © [JasmineSingh-07](https://github.com/JasmineSingh-07)
