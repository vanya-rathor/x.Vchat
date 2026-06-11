const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ✅ APNA PASSWORD YAHAN BADLO
const SECRET_PASSWORD = process.env.PASSWORD || 'x.V.x';

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/verify-password', (req, res) => {
  res.json({ success: req.body.password === SECRET_PASSWORD });
});

// ─── In-memory store ───
const messages = [];          // all messages
let msgId = 1;
const users = new Map();      // socketId → { name, online, lastSeen }
const usersByName = new Map(); // name → socketId

// ─── Helpers ───
function getUserList() {
  return [...users.values()].map(u => ({
    name: u.name,
    online: u.online,
    lastSeen: u.lastSeen
  }));
}

function findSocket(name) {
  const sid = usersByName.get(name);
  return sid ? io.sockets.sockets.get(sid) : null;
}

// ─── Socket events ───
io.on('connection', (socket) => {

  // JOIN
  socket.on('join', (name) => {
    // If same name reconnects, update socket id
    if (usersByName.has(name)) {
      const oldSid = usersByName.get(name);
      users.delete(oldSid);
    }

    users.set(socket.id, { name, online: true, lastSeen: null });
    usersByName.set(name, socket.id);

    // Send full history to this user
    socket.emit('history', messages);

    // Tell everyone user is online
    io.emit('user-list', getUserList());
    socket.broadcast.emit('sys-msg', `${name} joined 👋`);

    // Mark all undelivered messages as delivered for this user
    const undelivered = messages.filter(m => m.sender !== name && m.status === 'sent');
    undelivered.forEach(m => {
      m.status = 'delivered';
      // Notify original sender
      const senderSid = usersByName.get(m.sender);
      if (senderSid) {
        io.to(senderSid).emit('msg-delivered', { id: m.id });
      }
    });
  });

  // SEND MESSAGE
  socket.on('send-msg', (data) => {
    const user = users.get(socket.id);
    if (!user) return;

    const otherOnline = [...users.values()].some(u => u.name !== user.name && u.online);

    const msg = {
      id: msgId++,
      text: data.text,
      sender: user.name,
      time: now(),
      status: otherOnline ? 'delivered' : 'sent',
      reactions: {},
      replyTo: data.replyTo || null,   // { id, sender, text }
      deleted: false
    };

    messages.push(msg);
    io.emit('new-msg', msg);
  });

  // MESSAGES SEEN
  socket.on('seen', (ids) => {
    const viewer = users.get(socket.id);
    if (!viewer) return;

    ids.forEach(id => {
      const msg = messages.find(m => m.id === id);
      if (msg && msg.sender !== viewer.name && msg.status !== 'seen') {
        msg.status = 'seen';
        const senderSid = usersByName.get(msg.sender);
        if (senderSid) io.to(senderSid).emit('msg-seen', { id });
      }
    });
  });

  // REACT
  socket.on('react', ({ id, emoji }) => {
    const user = users.get(socket.id);
    if (!user) return;

    const msg = messages.find(m => m.id === id);
    if (!msg) return;

    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const idx = msg.reactions[emoji].indexOf(user.name);
    if (idx > -1) {
      msg.reactions[emoji].splice(idx, 1);
      if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    } else {
      // Remove previous reaction by this user on same message
      Object.keys(msg.reactions).forEach(e => {
        msg.reactions[e] = msg.reactions[e].filter(n => n !== user.name);
        if (!msg.reactions[e].length) delete msg.reactions[e];
      });
      if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
      msg.reactions[emoji].push(user.name);
    }

    io.emit('reaction-update', { id: msg.id, reactions: msg.reactions });
  });

  // DELETE MESSAGE
  socket.on('delete-msg', ({ id }) => {
    const user = users.get(socket.id);
    const msg = messages.find(m => m.id === id);
    if (!msg || msg.sender !== user?.name) return;
    msg.deleted = true;
    msg.text = '';
    io.emit('msg-deleted', { id });
  });

  // TYPING
  socket.on('typing', () => {
    const user = users.get(socket.id);
    if (user) socket.broadcast.emit('typing', user.name);
  });

  socket.on('stop-typing', () => {
    socket.broadcast.emit('stop-typing');
  });

  // DISCONNECT
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    if (!user) return;

    user.online = false;
    user.lastSeen = Date.now();
    io.emit('user-list', getUserList());
    socket.broadcast.emit('sys-msg', `${user.name} went offline`);
  });
});

function now() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
          
