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
