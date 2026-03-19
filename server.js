/**
 * =====================================================
 * VIRTUAL OFFICE - Servidor Node.js + Socket.io
 * =====================================================
 * Gerencia conexões, posições dos jogadores e salas
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuração do Socket.io com CORS liberado para desenvolvimento
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Servir arquivos estáticos do cliente
app.use(express.static(path.join(__dirname, '../client')));

// =====================================================
// ESTADO DO SERVIDOR
// =====================================================

// Mapa de jogadores conectados: { socketId -> playerData }
const players = {};

// Definição das zonas do mapa (usadas para lógica de salas)
// Estas coordenadas correspondem ao mapa criado no Phaser
const ZONES = {
  reception: {
    name: 'Recepção',
    x: 50, y: 50,
    width: 300, height: 200,
    color: 0x4ecdc4
  },
  open_area: {
    name: 'Área Aberta',
    x: 50, y: 300,
    width: 500, height: 400,
    color: 0x95e1d3
  },
  meeting_room: {
    name: 'Sala de Reunião',
    x: 600, y: 50,
    width: 350, height: 300,
    color: 0xf38181
  },
  private_room: {
    name: 'Sala Privada',
    x: 600, y: 400,
    width: 350, height: 300,
    color: 0xa29bfe
  }
};

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

/**
 * Detecta em qual zona o jogador está baseado em (x, y)
 */
function detectZone(x, y) {
  for (const [zoneId, zone] of Object.entries(ZONES)) {
    if (
      x >= zone.x && x <= zone.x + zone.width &&
      y >= zone.y && y <= zone.y + zone.height
    ) {
      return zoneId;
    }
  }
  return 'open_area'; // zona padrão
}

// =====================================================
// EVENTOS DO SOCKET.IO
// =====================================================

io.on('connection', (socket) => {
  console.log(`✅ Jogador conectado: ${socket.id}`);

  // -------------------------------------------------
  // EVENTO: Jogador entra no escritório
  // -------------------------------------------------
  socket.on('player:join', (data) => {
    const { name, avatar } = data;

    // Posição inicial aleatória na recepção
    const startX = 100 + Math.random() * 150;
    const startY = 80 + Math.random() * 100;

    // Criar dados do jogador
    players[socket.id] = {
      id: socket.id,
      name: name || 'Jogador',
      avatar: avatar || 'avatar1',
      x: startX,
      y: startY,
      zone: 'reception',
      direction: 'down',
      moving: false
    };

    console.log(`👤 ${name} entrou com avatar ${avatar}`);

    // Enviar para o novo jogador: lista de todos os outros jogadores
    socket.emit('players:list', players);

    // Avisar todos os outros que um novo jogador chegou
    socket.broadcast.emit('player:joined', players[socket.id]);
  });

  // -------------------------------------------------
  // EVENTO: Atualização de posição do jogador
  // -------------------------------------------------
  socket.on('player:move', (data) => {
    if (!players[socket.id]) return;

    const { x, y, direction, moving } = data;

    // Detectar zona atual
    const newZone = detectZone(x, y);
    const oldZone = players[socket.id].zone;

    // Atualizar dados do jogador
    players[socket.id].x = x;
    players[socket.id].y = y;
    players[socket.id].direction = direction;
    players[socket.id].moving = moving;

    // Se mudou de zona, emitir evento de mudança
    if (newZone !== oldZone) {
      players[socket.id].zone = newZone;

      // Avisar o próprio jogador
      socket.emit('player:zone_changed', {
        playerId: socket.id,
        zone: newZone,
        zoneName: ZONES[newZone]?.name || 'Área Aberta'
      });

      // Avisar todos sobre a mudança de zona (para WebRTC)
      io.emit('player:zone_update', {
        playerId: socket.id,
        oldZone,
        newZone
      });

      console.log(`🚶 ${players[socket.id].name}: ${oldZone} → ${newZone}`);
    }

    // Transmitir movimento para todos os outros jogadores
    socket.broadcast.emit('player:moved', {
      id: socket.id,
      x, y, direction, moving,
      zone: players[socket.id].zone
    });
  });

  // -------------------------------------------------
  // EVENTOS WEBRTC - Sinalização para áudio P2P
  // -------------------------------------------------

  // Oferta WebRTC (início de conexão de áudio)
  socket.on('webrtc:offer', (data) => {
    const { targetId, offer } = data;
    // Repassar oferta para o jogador alvo
    io.to(targetId).emit('webrtc:offer', {
      fromId: socket.id,
      offer
    });
  });

  // Resposta WebRTC
  socket.on('webrtc:answer', (data) => {
    const { targetId, answer } = data;
    io.to(targetId).emit('webrtc:answer', {
      fromId: socket.id,
      answer
    });
  });

  // ICE Candidate (negociação de rede WebRTC)
  socket.on('webrtc:ice_candidate', (data) => {
    const { targetId, candidate } = data;
    io.to(targetId).emit('webrtc:ice_candidate', {
      fromId: socket.id,
      candidate
    });
  });

  // -------------------------------------------------
  // EVENTO: Chat (mensagem de texto simples)
  // -------------------------------------------------
  socket.on('chat:message', (data) => {
    if (!players[socket.id]) return;

    const message = {
      playerId: socket.id,
      playerName: players[socket.id].name,
      text: data.text,
      zone: players[socket.id].zone,
      timestamp: Date.now()
    };

    // Enviar para jogadores na mesma zona
    for (const [id, player] of Object.entries(players)) {
      if (player.zone === players[socket.id].zone) {
        io.to(id).emit('chat:message', message);
      }
    }
  });

  // -------------------------------------------------
  // EVENTO: Desconexão
  // -------------------------------------------------
  socket.on('disconnect', () => {
    if (players[socket.id]) {
      console.log(`❌ ${players[socket.id].name} saiu`);
      delete players[socket.id];
    }

    // Avisar todos que o jogador saiu
    io.emit('player:left', { id: socket.id });
  });
});

// =====================================================
// INICIAR SERVIDOR
// =====================================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log('');
  console.log('🏢 ================================');
  console.log('   VIRTUAL OFFICE SERVER');
  console.log(`   Rodando em: http://localhost:${PORT}`);
  console.log('🏢 ================================');
  console.log('');
});
