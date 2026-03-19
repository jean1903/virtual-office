const express = require('express');
}

io.on('connection', (socket) => {
  console.log('Jogador conectado: ' + socket.id);

  socket.on('player:join', (data) => {
    const { name, avatar } = data;
    const startX = 100 + Math.random() * 150;
    const startY = 80 + Math.random() * 100;
    players[socket.id] = {
      id: socket.id, name: name || 'Jogador', avatar: avatar || 'avatar1',
      x: startX, y: startY, zone: 'reception', direction: 'down', moving: false
    };
    socket.emit('players:list', players);
    socket.broadcast.emit('player:joined', players[socket.id]);
  });

  socket.on('player:move', (data) => {
    if (!players[socket.id]) return;
    const { x, y, direction, moving } = data;
    const newZone = detectZone(x, y);
    const oldZone = players[socket.id].zone;
    players[socket.id].x = x;
    players[socket.id].y = y;
    players[socket.id].direction = direction;
    players[socket.id].moving = moving;
    if (newZone !== oldZone) {
      players[socket.id].zone = newZone;
      const zoneNames = { reception: 'Recepção', open_area: 'Área Aberta', meeting_room: 'Sala de Reunião', private_room: 'Sala Privada' };
      socket.emit('player:zone_changed', { playerId: socket.id, zone: newZone, zoneName: zoneNames[newZone] });
      io.emit('player:zone_update', { playerId: socket.id, oldZone, newZone });
    }
    socket.broadcast.emit('player:moved', { id: socket.id, x, y, direction, moving, zone: players[socket.id].zone });
  });

  socket.on('webrtc:offer', (data) => {
    io.to(data.targetId).emit('webrtc:offer', { fromId: socket.id, offer: data.offer });
  });

  socket.on('webrtc:answer', (data) => {
    io.to(data.targetId).emit('webrtc:answer', { fromId: socket.id, answer: data.answer });
  });

  socket.on('webrtc:ice_candidate', (data) => {
    io.to(data.targetId).emit('webrtc:ice_candidate', { fromId: socket.id, candidate: data.candidate });
  });

  socket.on('chat:message', (data) => {
    if (!players[socket.id]) return;
    const message = { playerId: socket.id, playerName: players[socket.id].name, text: data.text, zone: players[socket.id].zone };
    for (const [id, player] of Object.entries(players)) {
      if (player.zone === players[socket.id].zone) {
        io.to(id).emit('chat:message', message);
      }
    }
  });

  socket.on('disconnect', () => {
    if (players[socket.id]) {
      console.log(players[socket.id].name + ' saiu');
      delete players[socket.id];
    }
    io.emit('player:left', { id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Servidor rodando em: http://localhost:' + PORT);
});
