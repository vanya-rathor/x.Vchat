const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ✅ YAHAN APNA PASSWORD BADLO
const SECRET_PASSWORD = 'dost123';

app.use(express.static(path.join(__dirname, 'public')));

app.post('/verify-password', express.json(), (req, res) => {
  const { password } = req.body;
  if (password === SECRET_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Track connected users
let connectedUsers = 0;

io.on('connection', (socket) => {
  connectedUsers++;
  io.emit('user-count', connectedUsers);
  
  console.log(`User connected. Total: ${connectedUsers}`);

  socket.on('send-message', (data) => {
    // Broadcast to everyone including sender
    io.emit('receive-message', {
      text: data.text,
      sender: data.sender,
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('typing', (name) => {
    socket.broadcast.emit('user-typing', name);
  });

  socket.on('stop-typing', () => {
    socket.broadcast.emit('user-stopped-typing');
  });

  socket.on('disconnect', () => {
    connectedUsers--;
    io.emit('user-count', connectedUsers);
    console.log(`User disconnected. Total: ${connectedUsers}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
