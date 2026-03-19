const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
app.use(express.static(__dirname));
const players = {};
const ZONES = {
  reception: { x: 50, y: 50, width: 300, height: 200 },
  open_area: { x: 50, y: 300, width: 500, height: 400 },
  meeting_room: { x: 600, y: 50, width: 350, height: 300 },
  private_room: { x: 600, y: 400, width: 350, height: 300 }
};
function detectZone(x, y) {
  for (const [zoneId, zone] of Object.entries(ZONES)) {
    if (x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height) return zoneId;
  }
  return 'open_area';
}
io.on('connection', (socket) => {
  socket.on('player:join', (data) => {
    players[socket.id] = { id: socket.id, name: data.name || 'Jogador', avatar: data.avatar || 'avatar1', x: 100 + Math.random() * 150, y: 80 + Math.random() * 100, zone: 'reception', direction: 'down', moving: false };
    socket.emit('players:list', players);
    socket.broadcast.emit('player:joined', players[socket.id]);
  });
  socket.on('player:move', (data) => {
    if (!players[socket.id]) return;
    const newZone = detectZone(data.x, data.y);
    const oldZone = players[socket.id].zone;
    players[socket.id].x = data.x;
    players[socket.id].y = data.y;
    players[socket.id].direction = data.direction;
    players[socket.id].moving = data.moving;
    if (newZone !== oldZone) {
      players[socket.id].zone = newZone;
      const names = { reception: 'Recepção', open_area: 'Área Aberta', meeting_room: 'Sala de Reunião', private_room: 'Sala Privada' };
      socket.emit('player:zone_changed', { playerId: socket.id, zone: newZone, zoneName: names[newZone] });
      io.emit('player:zone_update', { playerId: socket.id, oldZone, newZone });
    }
    socket.broadcast.emit('player:moved', { id: socket.id, x: data.x, y: data.y, direction: data.direction, moving: data.moving, zone: players[socket.id].zone });
  });
  socket.on('webrtc:offer', (data) => { io.to(data.targetId).emit('webrtc:offer', { fromId: socket.id, offer: data.offer }); });
  socket.on('webrtc:answer', (data) => { io.to(data.targetId).emit('webrtc:answer', { fromId: socket.id, answer: data.answer }); });
  socket.on('webrtc:ice_candidate', (data) => { io.to(data.targetId).emit('webrtc:ice_candidate', { fromId: socket.id, candidate: data.candidate }); });
  socket.on('chat:message', (data) => {
    if (!players[socket.id]) return;
    const msg = { playerId: socket.id, playerName: players[socket.id].name, text: data.text, zone: players[socket.id].zone };
    for (const [id, player] of Object.entries(players)) { if (player.zone === players[socket.id].zone) io.to(id).emit('chat:message', msg); }
  });
  socket.on('disconnect', () => { delete players[socket.id]; io.emit('player:left', { id: socket.id }); });
});
const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => { console.log('Servidor rodando na porta ' + PORT); });
