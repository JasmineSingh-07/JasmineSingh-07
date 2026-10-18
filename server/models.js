const m = require('mongoose');
const id = { type: m.Schema.Types.ObjectId };

// Metadata only. Raw audio is never stored or even sent to the server (WebRTC is peer-to-peer).
const User = m.model('User', new m.Schema({ name: String, email: { type: String, unique: true, lowercase: true }, pass: String }));
const Room = m.model('Room', new m.Schema({
  name: { type: String, unique: true },
  radius: { type: Number, default: 250 }, // hearing radius in virtual metres (5000 = meeting mode, everyone hears everyone)
  owner: { ...id, ref: 'User' },
  pass: String, // bcrypt hash, empty for public rooms
  createdAt: { type: Date, default: Date.now },
}));
const Session = m.model('Session', new m.Schema({
  room: { ...id, ref: 'Room' }, user: { ...id, ref: 'User' }, name: String,
  joinedAt: { type: Date, default: Date.now }, leftAt: Date,
}));

module.exports = { User, Room, Session };
