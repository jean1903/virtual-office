/**
 * =====================================================
 * VIRTUAL OFFICE - main.js
 * Phaser.js + Socket.io + WebRTC
 * =====================================================
 */

// =====================================================
// ESTADO GLOBAL
// =====================================================
const GameState = {
  socket: null,           // Conexão Socket.io
  playerName: '',         // Nome do jogador local
  playerAvatar: 'avatar1', // Avatar escolhido
  localPlayerId: null,    // ID do socket local
  currentZone: 'reception', // Zona atual
  isMuted: false,         // Microfone mutado?
  localStream: null,      // Stream de áudio local
  peerConnections: {},    // Conexões WebRTC { socketId -> RTCPeerConnection }
  remoteAudios: {},       // Elementos <audio> remotos
};

// =====================================================
// CORES DOS AVATARES (palette pixel art)
// =====================================================
const AVATAR_PALETTES = {
  avatar1: { skin: '#fdbcb4', hair: '#3d2b1f', shirt: '#7c6dfa', pants: '#2d3561' },
  avatar2: { skin: '#f5cba7', hair: '#d4a017', shirt: '#fa6d9e', pants: '#1a3a2a' },
  avatar3: { skin: '#c8a882', hair: '#1a1a1a', shirt: '#6dfac0', pants: '#2a1a3a' },
};

// =====================================================
// DESENHAR AVATARES PIXEL ART NO CANVAS
// =====================================================
function drawPixelAvatar(canvasId, palette, scale = 3) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Grid pixel (8x12 pixels -> canvas 48x48 com scale 4)
  const px = scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const draw = (col, row, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(col * px + 8, row * px + 4, px, px);
  };

  // Cabeça (4x4)
  for (let c = 1; c <= 4; c++) {
    for (let r = 0; r <= 3; r++) {
      draw(c, r, palette.skin);
    }
  }
  // Cabelo
  for (let c = 1; c <= 4; c++) draw(c, 0, palette.hair);
  draw(1, 1, palette.hair);
  draw(4, 1, palette.hair);

  // Olhos
  draw(2, 2, '#000');
  draw(3, 2, '#000');

  // Corpo / camisa (4x4)
  for (let c = 1; c <= 4; c++) {
    for (let r = 4; r <= 7; r++) {
      draw(c, r, palette.shirt);
    }
  }
  // Braços
  draw(0, 4, palette.shirt);
  draw(0, 5, palette.shirt);
  draw(5, 4, palette.shirt);
  draw(5, 5, palette.shirt);

  // Calças
  for (let c = 1; c <= 4; c++) {
    for (let r = 8; r <= 11; r++) {
      draw(c, r, palette.pants);
    }
  }
}

// Desenhar previews na tela de login
function drawAllPreviews() {
  drawPixelAvatar('preview-avatar1', AVATAR_PALETTES.avatar1, 4);
  drawPixelAvatar('preview-avatar2', AVATAR_PALETTES.avatar2, 4);
  drawPixelAvatar('preview-avatar3', AVATAR_PALETTES.avatar3, 4);
}

// =====================================================
// PARTÍCULAS DE FUNDO
// =====================================================
function createParticles() {
  const container = document.getElementById('particles');
  const colors = ['#7c6dfa', '#fa6d9e', '#6dfac0'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (8 + Math.random() * 15) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    container.appendChild(p);
  }
}

// =====================================================
// CONEXÃO SOCKET.IO (feita antes de entrar)
// =====================================================
function initSocket() {
  GameState.socket = io();

  GameState.socket.on('connect', () => {
    GameState.localPlayerId = GameState.socket.id;
    document.getElementById('connection-status').textContent =
      'Servidor online — pronto para entrar!';
    document.getElementById('btn-enter').disabled = false;
  });

  GameState.socket.on('disconnect', () => {
    document.getElementById('connection-status').textContent =
      'Desconectado do servidor';
  });

  GameState.socket.on('connect_error', () => {
    document.getElementById('connection-status').textContent =
      '⚠️ Erro ao conectar — verifique o servidor';
  });
}

// =====================================================
// ENTRAR NO ESCRITÓRIO
// =====================================================
function enterOffice() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();

  if (!name) {
    nameInput.style.borderColor = '#fa6d9e';
    nameInput.placeholder = 'Digite seu nome!';
    nameInput.focus();
    setTimeout(() => { nameInput.style.borderColor = ''; }, 2000);
    return;
  }

  const avatarEl = document.querySelector('input[name="avatar"]:checked');
  const avatar = avatarEl ? avatarEl.value : 'avatar1';

  GameState.playerName = name;
  GameState.playerAvatar = avatar;

  // Esconder tela de login, mostrar jogo
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('hud-player-name').textContent = name;

  // Iniciar o jogo Phaser
  startPhaserGame();

  // Iniciar áudio WebRTC
  initAudio();
}

// =====================================================
// =====================================================
//  PHASER.JS - JOGO 2D
// =====================================================
// =====================================================

// Dimensões do mapa do escritório
const MAP_WIDTH = 960;
const MAP_HEIGHT = 720;

// Definição das zonas (mesmas do servidor, replicadas aqui)
const ZONES = {
  reception: { x: 50, y: 50, w: 300, h: 200, name: 'Recepção', color: 0x4ecdc4 },
  open_area: { x: 50, y: 300, w: 500, h: 400, name: 'Área Aberta', color: 0x95e1d3 },
  meeting_room: { x: 600, y: 50, w: 350, h: 300, name: 'Sala de Reunião', color: 0xf38181 },
  private_room: { x: 600, y: 400, w: 350, h: 300, name: 'Sala Privada', color: 0xa29bfe },
};

// Referência ao jogo Phaser
let phaserGame = null;
// Referência à cena principal
let mainScene = null;
// Sprites de outros jogadores { socketId -> container }
const otherPlayers = {};

function startPhaserGame() {
  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#1a1a2e',
    parent: 'game-canvas-container',
    pixelArt: true,
    antialias: false,
    scene: {
      preload: preload,
      create: createScene,
      update: updateScene,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false }
    }
  };

  phaserGame = new Phaser.Game(config);
}

// =====================================================
// VARIÁVEIS DA CENA
// =====================================================
let localPlayer = null;     // Sprite do jogador local
let cursors = null;         // Teclas de cursor
let wasd = null;            // Teclas WASD
let playerNameText = null;  // Texto com nome sobre o avatar
let cameraFollowing = true;
let lastZone = '';
let moveSpeed = 160;
let playerTween = null;

// =====================================================
// PRELOAD - Gerar texturas programaticamente
// =====================================================
function preload() {
  // Nada para carregar de disco — tudo é gerado via código
}

// =====================================================
// CREATE - Montar a cena
// =====================================================
function createScene() {
  const scene = this;
  mainScene = scene;

  // Definir bounds do mundo
  scene.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // ----- DESENHAR O MAPA -----
  drawOfficeMap(scene);

  // ----- CRIAR JOGADOR LOCAL -----
  const palette = AVATAR_PALETTES[GameState.playerAvatar];
  localPlayer = createPlayerSprite(scene, 180, 130, palette, true);

  // Física no jogador
  scene.physics.add.existing(localPlayer);
  localPlayer.body.setCollideWorldBounds(true);
  localPlayer.body.setSize(20, 20);

  // ----- CÂMERA -----
  scene.cameras.main.startFollow(localPlayer, true, 0.08, 0.08);
  scene.cameras.main.setZoom(1.2);
  scene.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // ----- CONTROLES -----
  cursors = scene.input.keyboard.createCursorKeys();
  wasd = scene.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D,
  });

  // ----- SOCKET.IO EVENTOS -----
  setupSocketEvents(scene);

  // Comunicar ao servidor que entrou
  GameState.socket.emit('player:join', {
    name: GameState.playerName,
    avatar: GameState.playerAvatar,
  });

  // ----- CHAT -----
  setupChat();

  // Redimensionamento da janela
  window.addEventListener('resize', () => {
    if (phaserGame) {
      phaserGame.scale.resize(window.innerWidth, window.innerHeight);
    }
  });
}

// =====================================================
// DESENHAR O MAPA DO ESCRITÓRIO
// =====================================================
function drawOfficeMap(scene) {
  const g = scene.add.graphics();

  // ----- CHÃO GERAL -----
  g.fillStyle(0x16213e);
  g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // ----- GRID SUTIL -----
  g.lineStyle(1, 0x0f3460, 0.3);
  for (let x = 0; x < MAP_WIDTH; x += 32) g.lineBetween(x, 0, x, MAP_HEIGHT);
  for (let y = 0; y < MAP_HEIGHT; y += 32) g.lineBetween(0, y, MAP_WIDTH, y);

  // ----- RECEPÇÃO -----
  const recep = ZONES.reception;
  g.fillStyle(0x0f3460, 0.8);
  g.fillRect(recep.x, recep.y, recep.w, recep.h);
  g.lineStyle(2, 0x4ecdc4, 0.6);
  g.strokeRect(recep.x, recep.y, recep.w, recep.h);

  // Balcão de recepção
  g.fillStyle(0x2d6a4f);
  g.fillRect(100, 80, 180, 40);
  g.fillStyle(0x52b788);
  g.fillRect(102, 82, 176, 12);

  // Plantas decorativas
  drawPlant(g, 65, 65);
  drawPlant(g, 320, 65);

  // Cadeiras na recepção
  g.fillStyle(0x7c6dfa);
  g.fillRect(80, 160, 24, 24);
  g.fillRect(120, 160, 24, 24);
  g.fillRect(200, 160, 24, 24);

  // ----- ÁREA ABERTA -----
  const open = ZONES.open_area;
  g.fillStyle(0x0d2137, 0.8);
  g.fillRect(open.x, open.y, open.w, open.h);
  g.lineStyle(2, 0x95e1d3, 0.4);
  g.strokeRect(open.x, open.y, open.w, open.h);

  // Mesas de trabalho (grid de 4 mesas)
  const deskPositions = [
    [80, 340], [200, 340], [320, 340], [420, 340],
    [80, 460], [200, 460], [320, 460], [420, 460],
    [80, 580], [200, 580], [320, 580], [420, 580],
  ];

  deskPositions.forEach(([dx, dy]) => {
    drawDesk(g, dx, dy);
  });

  // ----- SALA DE REUNIÃO -----
  const meet = ZONES.meeting_room;
  g.fillStyle(0x1a0a2e, 0.9);
  g.fillRect(meet.x, meet.y, meet.w, meet.h);
  g.lineStyle(2, 0xf38181, 0.7);
  g.strokeRect(meet.x, meet.y, meet.w, meet.h);

  // Mesa grande de reunião
  g.fillStyle(0x4a1942);
  g.fillRect(650, 100, 240, 120);
  g.lineStyle(2, 0xf38181, 0.5);
  g.strokeRect(650, 100, 240, 120);

  // Cadeiras ao redor da mesa
  const chairColor = 0xf38181;
  g.fillStyle(chairColor);
  // Top
  for (let cx = 670; cx <= 850; cx += 40) g.fillRect(cx, 88, 20, 10);
  // Bottom
  for (let cx = 670; cx <= 850; cx += 40) g.fillRect(cx, 222, 20, 10);
  // Left
  g.fillRect(638, 120, 10, 20);
  g.fillRect(638, 160, 10, 20);
  // Right
  g.fillRect(892, 120, 10, 20);
  g.fillRect(892, 160, 10, 20);

  // Planta decorativa
  drawPlant(g, 608, 58);
  drawPlant(g, 930, 58);

  // Tela de projeção
  g.fillStyle(0xfafafa, 0.9);
  g.fillRect(670, 240, 200, 90);
  g.lineStyle(1, 0xf38181);
  g.strokeRect(670, 240, 200, 90);

  // ----- SALA PRIVADA -----
  const priv = ZONES.private_room;
  g.fillStyle(0x1a0a1a, 0.9);
  g.fillRect(priv.x, priv.y, priv.w, priv.h);
  g.lineStyle(2, 0xa29bfe, 0.7);
  g.strokeRect(priv.x, priv.y, priv.w, priv.h);

  // Mesa privada
  g.fillStyle(0x2d1b69);
  g.fillRect(650, 450, 120, 80);
  g.lineStyle(1, 0xa29bfe, 0.5);
  g.strokeRect(650, 450, 120, 80);

  // Sofá / área de descanso
  g.fillStyle(0x4a237a);
  g.fillRect(800, 440, 130, 60);
  g.fillStyle(0x6b35a3);
  g.fillRect(800, 440, 130, 15);
  g.fillRect(800, 440, 15, 60);

  // Planta
  drawPlant(g, 608, 408);
  drawPlant(g, 930, 408);

  // ----- PAREDES / SEPARADORES -----
  g.lineStyle(3, 0x2a2a42, 1);
  // Separador horizontal
  g.lineBetween(50, 260, 580, 260);
  // Separador vertical
  g.lineBetween(570, 50, 570, 720);
  // Porta recepção -> área aberta
  g.lineStyle(3, 0x4ecdc4, 0.8);
  g.lineBetween(200, 258, 280, 258);

  // Porta meeting room
  g.lineStyle(3, 0xf38181, 0.8);
  g.lineBetween(700, 352, 780, 352);

  // ----- LABELS DAS ZONAS -----
  const labelStyle = {
    fontFamily: '"Space Mono", monospace',
    fontSize: '11px',
    color: '#888899',
    letterSpacing: 3,
  };

  scene.add.text(recep.x + recep.w / 2, recep.y + 12, '// RECEPÇÃO', labelStyle).setOrigin(0.5, 0);
  scene.add.text(open.x + open.w / 2, open.y + 12, '// ÁREA ABERTA', labelStyle).setOrigin(0.5, 0);
  scene.add.text(meet.x + meet.w / 2, meet.y + 12, '// SALA DE REUNIÃO', { ...labelStyle, color: '#f38181' }).setOrigin(0.5, 0);
  scene.add.text(priv.x + priv.w / 2, priv.y + 12, '// SALA PRIVADA', { ...labelStyle, color: '#a29bfe' }).setOrigin(0.5, 0);
}

// Desenha uma planta decorativa simples
function drawPlant(g, x, y) {
  g.fillStyle(0x2d6a4f);
  g.fillRect(x, y, 14, 14);
  g.fillStyle(0x52b788);
  g.fillRect(x + 2, y - 6, 4, 8);
  g.fillRect(x + 8, y - 8, 4, 10);
}

// Desenha uma mesa de trabalho com monitor
function drawDesk(g, x, y) {
  // Mesa
  g.fillStyle(0x2d3561);
  g.fillRect(x, y, 80, 50);
  // Monitor
  g.fillStyle(0x0d0d14);
  g.fillRect(x + 15, y + 5, 50, 30);
  g.fillStyle(0x7c6dfa);
  g.fillRect(x + 17, y + 7, 46, 24);
  // Cadeira
  g.fillStyle(0x4a4a7a);
  g.fillRect(x + 28, y + 52, 24, 20);
}

// =====================================================
// CRIAR SPRITE DE JOGADOR (pixel art via Graphics)
// =====================================================
function createPlayerSprite(scene, x, y, palette, isLocal = false) {
  const container = scene.add.container(x, y);

  // Gerar textura pixel art única para este avatar
  const texKey = `player_${palette.hair}_${palette.shirt}`;

  if (!scene.textures.exists(texKey)) {
    const rt = scene.add.renderTexture(0, 0, 24, 32);
    const g2 = scene.add.graphics();

    const px = 3;
    const drawPx = (col, row, color) => {
      g2.fillStyle(color, 1);
      g2.fillRect(col * px, row * px, px, px);
    };

    // --- Cabeça ---
    for (let c = 1; c <= 4; c++) for (let r = 0; r <= 3; r++) drawPx(c, r, hexStringToNum(palette.skin));
    for (let c = 1; c <= 4; c++) drawPx(c, 0, hexStringToNum(palette.hair));
    drawPx(1, 1, hexStringToNum(palette.hair));
    drawPx(4, 1, hexStringToNum(palette.hair));
    drawPx(2, 2, 0x000000);
    drawPx(3, 2, 0x000000);
    drawPx(2, 3, 0xcc8866);

    // --- Corpo ---
    for (let c = 1; c <= 4; c++) for (let r = 4; r <= 6; r++) drawPx(c, r, hexStringToNum(palette.shirt));
    drawPx(0, 4, hexStringToNum(palette.shirt));
    drawPx(0, 5, hexStringToNum(palette.shirt));
    drawPx(5, 4, hexStringToNum(palette.shirt));
    drawPx(5, 5, hexStringToNum(palette.shirt));

    // --- Calças ---
    for (let c = 1; c <= 2; c++) for (let r = 7; r <= 9; r++) drawPx(c, r, hexStringToNum(palette.pants));
    for (let c = 3; c <= 4; c++) for (let r = 7; r <= 9; r++) drawPx(c, r, hexStringToNum(palette.pants));

    rt.draw(g2, 0, 0);
    rt.saveTexture(texKey);
    g2.destroy();
    rt.destroy();
  }

  // Sprite usando a textura gerada
  const sprite = scene.add.image(0, 0, texKey);
  sprite.setScale(1.5);
  container.add(sprite);

  // Sombra embaixo do personagem
  const shadow = scene.add.ellipse(0, 18, 18, 6, 0x000000, 0.3);
  container.addAt(shadow, 0);

  // Nome acima do personagem
  const nameLabel = scene.add.text(0, -28, isLocal ? GameState.playerName : '', {
    fontFamily: '"Space Mono", monospace',
    fontSize: '9px',
    color: isLocal ? '#7c6dfa' : '#e8e8f0',
    stroke: '#0d0d14',
    strokeThickness: 3,
  }).setOrigin(0.5, 1);

  container.add(nameLabel);
  container.nameLabel = nameLabel;

  // Indicador de zona para jogador local
  if (isLocal) {
    const indicator = scene.add.circle(10, -32, 4, 0x6dfac0);
    container.add(indicator);
    container.zoneIndicator = indicator;

    // Tweena o indicador
    scene.tweens.add({
      targets: indicator,
      alpha: 0,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  return container;
}

// Converte string hex como '#7c6dfa' para número
function hexStringToNum(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

// =====================================================
// UPDATE - Loop principal do Phaser
// =====================================================
let lastSentX = 0, lastSentY = 0;
let lastSentTime = 0;

function updateScene() {
  const scene = this;
  if (!localPlayer || !localPlayer.body) return;

  const body = localPlayer.body;
  const speed = moveSpeed;

  let vx = 0, vy = 0;
  let moving = false;
  let direction = 'down';

  // ----- MOVIMENTO -----
  if (cursors.left.isDown || wasd.left.isDown) {
    vx = -speed;
    direction = 'left';
    moving = true;
  } else if (cursors.right.isDown || wasd.right.isDown) {
    vx = speed;
    direction = 'right';
    moving = true;
  }

  if (cursors.up.isDown || wasd.up.isDown) {
    vy = -speed;
    direction = 'up';
    moving = true;
  } else if (cursors.down.isDown || wasd.down.isDown) {
    vy = speed;
    direction = 'down';
    moving = true;
  }

  body.setVelocity(vx, vy);

  // ----- ANIMAÇÃO DE BOB (balançar enquanto anda) -----
  if (moving) {
    localPlayer.y += Math.sin(scene.time.now * 0.012) * 0.3;
  }

  // ----- ENVIAR POSIÇÃO AO SERVIDOR (throttle ~20fps) -----
  const now = Date.now();
  const x = Math.round(localPlayer.x);
  const y = Math.round(localPlayer.y);

  if (now - lastSentTime > 50 && (x !== lastSentX || y !== lastSentY || moving)) {
    GameState.socket.emit('player:move', { x, y, direction, moving });
    lastSentX = x;
    lastSentY = y;
    lastSentTime = now;
  }

  // ----- INTERPOLAÇÃO dos outros jogadores -----
  for (const [id, data] of Object.entries(otherPlayers)) {
    if (data.container && data.targetX !== undefined) {
      data.container.x += (data.targetX - data.container.x) * 0.15;
      data.container.y += (data.targetY - data.container.y) * 0.15;

      // Bob de animação
      if (data.moving) {
        data.container.y += Math.sin(scene.time.now * 0.012 + id.charCodeAt(0)) * 0.2;
      }
    }
  }
}

// =====================================================
// SOCKET.IO - EVENTOS DO JOGO
// =====================================================
function setupSocketEvents(scene) {
  const socket = GameState.socket;

  // Recebe lista completa de jogadores já conectados
  socket.on('players:list', (players) => {
    for (const [id, player] of Object.entries(players)) {
      if (id === socket.id) continue;
      addOtherPlayer(scene, id, player);
    }
    updateOnlineCount();
  });

  // Novo jogador entrou
  socket.on('player:joined', (player) => {
    if (player.id === socket.id) return;
    addOtherPlayer(scene, player.id, player);
    addChatMessage('sistema', `${player.name} entrou no escritório`);
    updateOnlineCount();
  });

  // Outro jogador se moveu
  socket.on('player:moved', (data) => {
    if (otherPlayers[data.id]) {
      otherPlayers[data.id].targetX = data.x;
      otherPlayers[data.id].targetY = data.y;
      otherPlayers[data.id].moving = data.moving;
    }
  });

  // Jogador saiu
  socket.on('player:left', (data) => {
    if (otherPlayers[data.id]) {
      const name = otherPlayers[data.id].name;
      otherPlayers[data.id].container.destroy();
      delete otherPlayers[data.id];
      addChatMessage('sistema', `${name} saiu`);
      updateOnlineCount();
    }
    // Fechar WebRTC com quem saiu
    closePeerConnection(data.id);
  });

  // Mudança de zona (próprio jogador)
  socket.on('player:zone_changed', (data) => {
    GameState.currentZone = data.zone;
    showZoneNotification(data.zoneName);
    document.getElementById('hud-zone-name').textContent = data.zoneName;

    // Atualizar cor do indicador
    if (localPlayer && localPlayer.zoneIndicator) {
      const zoneColors = {
        reception: 0x4ecdc4,
        open_area: 0x95e1d3,
        meeting_room: 0xf38181,
        private_room: 0xa29bfe,
      };
      localPlayer.zoneIndicator.setFillStyle(zoneColors[data.zone] || 0x6dfac0);
    }

    // Atualizar WebRTC ao mudar de sala
    updateVoiceConnections(data.zone);
  });

  // Mudança de zona de outro jogador (para WebRTC)
  socket.on('player:zone_update', (data) => {
    if (otherPlayers[data.playerId]) {
      otherPlayers[data.playerId].zone = data.newZone;
    }
    // Atualizar conexões de voz
    updateVoiceConnections(GameState.currentZone);
  });

  // Mensagem de chat
  socket.on('chat:message', (msg) => {
    addChatMessage(msg.playerName, msg.text);
  });

  // Sinalização WebRTC
  socket.on('webrtc:offer', async ({ fromId, offer }) => {
    await handleWebRTCOffer(fromId, offer);
  });

  socket.on('webrtc:answer', async ({ fromId, answer }) => {
    const pc = GameState.peerConnections[fromId];
    if (pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });

  socket.on('webrtc:ice_candidate', async ({ fromId, candidate }) => {
    const pc = GameState.peerConnections[fromId];
    if (pc && candidate) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  });
}

// =====================================================
// ADICIONAR OUTRO JOGADOR NA CENA
// =====================================================
function addOtherPlayer(scene, id, playerData) {
  const palette = AVATAR_PALETTES[playerData.avatar] || AVATAR_PALETTES.avatar1;
  const container = createPlayerSprite(scene, playerData.x, playerData.y, palette, false);
  container.nameLabel.setText(playerData.name);

  otherPlayers[id] = {
    container,
    name: playerData.name,
    avatar: playerData.avatar,
    targetX: playerData.x,
    targetY: playerData.y,
    zone: playerData.zone,
    moving: false,
  };
}

// =====================================================
// NOTIFICAÇÃO DE ZONA
// =====================================================
let zoneNotifTimeout = null;

function showZoneNotification(zoneName) {
  const el = document.getElementById('zone-notification');
  el.textContent = `► ${zoneName}`;
  el.classList.add('visible');
  clearTimeout(zoneNotifTimeout);
  zoneNotifTimeout = setTimeout(() => el.classList.remove('visible'), 3000);
}

// =====================================================
// CHAT
// =====================================================
function setupChat() {
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');

  const sendMsg = () => {
    const text = input.value.trim();
    if (!text) return;
    GameState.socket.emit('chat:message', { text });
    input.value = '';
  };

  sendBtn.onclick = sendMsg;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendMsg();
    // Impedir que as teclas WASD movam o personagem enquanto digita
    e.stopPropagation();
  });
}

function addChatMessage(author, text) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');

  if (author === 'sistema') {
    div.className = 'chat-msg system';
    div.textContent = `› ${text}`;
  } else {
    div.className = 'chat-msg';
    div.innerHTML = `<span class="msg-author">[${author}]</span> <span class="msg-text">${text}</span>`;
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// =====================================================
// CONTAGEM ONLINE
// =====================================================
function updateOnlineCount() {
  const count = Object.keys(otherPlayers).length + 1;
  document.getElementById('online-num').textContent = count;
}

// =====================================================
// =====================================================
//  WEBRTC - ÁUDIO POR SALA
// =====================================================
// =====================================================

async function initAudio() {
  try {
    // Solicitar acesso ao microfone
    GameState.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
      },
      video: false,
    });

    document.getElementById('audio-icon').textContent = '🎤';
    document.getElementById('audio-zone-label').textContent = 'Recepção';

    // Botão de mute
    document.getElementById('mute-btn').onclick = toggleMute;

    console.log('🎤 Microfone iniciado');
  } catch (err) {
    console.warn('⚠️ Microfone não disponível:', err.message);
    document.getElementById('audio-icon').textContent = '🚫';
    document.getElementById('audio-zone-label').textContent = 'Sem áudio';
  }
}

function toggleMute() {
  if (!GameState.localStream) return;

  GameState.isMuted = !GameState.isMuted;
  GameState.localStream.getAudioTracks().forEach(track => {
    track.enabled = !GameState.isMuted;
  });

  const btn = document.getElementById('mute-btn');
  const icon = document.getElementById('audio-icon');
  btn.textContent = GameState.isMuted ? 'ATIVO' : 'MUDO';
  icon.textContent = GameState.isMuted ? '🔇' : '🎤';
}

/**
 * Atualiza conexões de voz quando muda de zona.
 * Só conecta com quem está na mesma zona.
 */
function updateVoiceConnections(currentZone) {
  document.getElementById('audio-zone-label').textContent =
    ZONES[currentZone]?.name || currentZone;

  // Fechar conexões com quem está em zona diferente
  for (const [peerId, pc] of Object.entries(GameState.peerConnections)) {
    const peerZone = otherPlayers[peerId]?.zone;
    if (peerZone !== currentZone) {
      closePeerConnection(peerId);
    }
  }

  // Abrir conexões com quem está na mesma zona
  for (const [peerId, playerData] of Object.entries(otherPlayers)) {
    if (playerData.zone === currentZone && !GameState.peerConnections[peerId]) {
      initiateWebRTCCall(peerId);
    }
  }
}

/**
 * Inicia chamada WebRTC com outro jogador
 */
async function initiateWebRTCCall(targetId) {
  if (!GameState.localStream) return;

  const pc = createPeerConnection(targetId);

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    GameState.socket.emit('webrtc:offer', {
      targetId,
      offer: pc.localDescription,
    });
  } catch (err) {
    console.error('Erro ao criar offer WebRTC:', err);
  }
}

/**
 * Responde a uma oferta WebRTC recebida
 */
async function handleWebRTCOffer(fromId, offer) {
  if (!GameState.localStream) return;

  const pc = createPeerConnection(fromId);

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    GameState.socket.emit('webrtc:answer', {
      targetId: fromId,
      answer: pc.localDescription,
    });
  } catch (err) {
    console.error('Erro ao responder offer WebRTC:', err);
  }
}

/**
 * Cria e configura um RTCPeerConnection
 */
function createPeerConnection(peerId) {
  // Servidores STUN públicos para traversal de NAT
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ],
  };

  const pc = new RTCPeerConnection(config);
  GameState.peerConnections[peerId] = pc;

  // Adicionar trilha de áudio local
  if (GameState.localStream) {
    GameState.localStream.getTracks().forEach(track => {
      pc.addTrack(track, GameState.localStream);
    });
  }

  // Receber áudio remoto
  pc.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    document.body.appendChild(audio);
    GameState.remoteAudios[peerId] = audio;
    console.log(`🔊 Áudio conectado com ${peerId}`);
  };

  // Enviar ICE candidates ao outro peer
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      GameState.socket.emit('webrtc:ice_candidate', {
        targetId: peerId,
        candidate: event.candidate,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`WebRTC [${peerId}]: ${pc.connectionState}`);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      closePeerConnection(peerId);
    }
  };

  return pc;
}

/**
 * Fecha uma conexão WebRTC e remove o áudio remoto
 */
function closePeerConnection(peerId) {
  if (GameState.peerConnections[peerId]) {
    GameState.peerConnections[peerId].close();
    delete GameState.peerConnections[peerId];
  }

  if (GameState.remoteAudios[peerId]) {
    GameState.remoteAudios[peerId].pause();
    GameState.remoteAudios[peerId].remove();
    delete GameState.remoteAudios[peerId];
  }
}

// =====================================================
// INICIALIZAÇÃO
// =====================================================
document.addEventListener('DOMContentLoaded', () => {
  drawAllPreviews();
  createParticles();
  initSocket();

  // Permitir Enter no campo de nome
  document.getElementById('player-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') enterOffice();
  });

  // Desabilitar botão até conectar
  document.getElementById('btn-enter').disabled = true;
});
