const GameState = {
  socket: null, playerName: '', playerAvatar: 'avatar1',
  localPlayerId: null, currentZone: 'reception', isMuted: false,
  localStream: null, peerConnections: {}, remoteAudios: {}
};

const AVATAR_PALETTES = {
  avatar1: { skin: '#fdbcb4', hair: '#3d2b1f', shirt: '#7c6dfa', pants: '#2d3561' },
  avatar2: { skin: '#f5cba7', hair: '#d4a017', shirt: '#fa6d9e', pants: '#1a3a2a' },
  avatar3: { skin: '#c8a882', hair: '#1a1a1a', shirt: '#6dfac0', pants: '#2a1a3a' }
};

const ZONES = {
  reception:    { x:50,  y:50,  w:300, h:200, name:'Recepcao' },
  open_area:    { x:50,  y:300, w:500, h:400, name:'Area Aberta' },
  meeting_room: { x:600, y:50,  w:350, h:300, name:'Sala de Reuniao' },
  private_room: { x:600, y:400, w:350, h:300, name:'Sala Privada' }
};

const MAP_WIDTH = 960, MAP_HEIGHT = 720;
let phaserGame = null, mainScene = null, localPlayer = null;
let cursors = null, wasd = null;
const otherPlayers = {};
let lastSentX = 0, lastSentY = 0, lastSentTime = 0;

function hexStringToNum(hex) { return parseInt(hex.replace('#',''), 16); }

function drawPixelAvatar(canvasId, palette, scale) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const px = scale || 3;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const draw = (col, row, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(col*px+8, row*px+4, px, px);
  };
  for(let c=1;c<=4;c++) for(let r=0;r<=3;r++) draw(c,r,palette.skin);
  for(let c=1;c<=4;c++) draw(c,0,palette.hair);
  draw(1,1,palette.hair); draw(4,1,palette.hair);
  draw(2,2,'#000'); draw(3,2,'#000');
  for(let c=1;c<=4;c++) for(let r=4;r<=7;r++) draw(c,r,palette.shirt);
  draw(0,4,palette.shirt); draw(0,5,palette.shirt);
  draw(5,4,palette.shirt); draw(5,5,palette.shirt);
  for(let c=1;c<=4;c++) for(let r=8;r<=11;r++) draw(c,r,palette.pants);
}

function drawAllPreviews() {
  drawPixelAvatar('preview-avatar1', AVATAR_PALETTES.avatar1, 4);
  drawPixelAvatar('preview-avatar2', AVATAR_PALETTES.avatar2, 4);
  drawPixelAvatar('preview-avatar3', AVATAR_PALETTES.avatar3, 4);
}

function createParticles() {
  const container = document.getElementById('particles');
  const colors = ['#7c6dfa','#fa6d9e','#6dfac0'];
  for(let i=0;i<20;i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random()*100+'vw';
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    p.style.animationDuration = (8+Math.random()*15)+'s';
    p.style.animationDelay = (Math.random()*10)+'s';
    p.style.width = p.style.height = (2+Math.random()*3)+'px';
    container.appendChild(p);
  }
}

function initSocket() {
  GameState.socket = io();
  GameState.socket.on('connect', () => {
    GameState.localPlayerId = GameState.socket.id;
    document.getElementById('connection-status').textContent = 'Servidor online - pronto para entrar!';
    document.getElementById('btn-enter').disabled = false;
  });
  GameState.socket.on('disconnect', () => {
    document.getElementById('connection-status').textContent = 'Desconectado do servidor';
  });
  GameState.socket.on('connect_error', () => {
    document.getElementById('connection-status').textContent = 'Erro ao conectar - verifique o servidor';
  });
}

function enterOffice() {
  const nameInput = document.getElementById('player-name');
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.style.borderColor = '#fa6d9e';
    nameInput.focus();
    setTimeout(() => { nameInput.style.borderColor = ''; }, 2000);
    return;
  }
  const avatarEl = document.querySelector('input[name="avatar"]:checked');
  GameState.playerName = name;
  GameState.playerAvatar = avatarEl ? avatarEl.value : 'avatar1';
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';
  document.getElementById('hud-player-name').textContent = name;
  startPhaserGame();
  initAudio();
}

function startPhaserGame() {
  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#1a1a2e',
    parent: 'game-canvas-container',
    pixelArt: true,
    scene: { preload: function(){}, create: createScene, update: updateScene },
    physics: { default: 'arcade', arcade: { debug: false } }
  };
  phaserGame = new Phaser.Game(config);
}

function createScene() {
  const scene = this;
  mainScene = scene;
  scene.physics.world.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
  drawOfficeMap(scene);
  const palette = AVATAR_PALETTES[GameState.playerAvatar];
  localPlayer = createPlayerSprite(scene, 180, 130, palette, true);
  scene.physics.add.existing(localPlayer);
  localPlayer.body.setCollideWorldBounds(true);
  localPlayer.body.setSize(20, 20);
  scene.cameras.main.startFollow(localPlayer, true, 0.08, 0.08);
  scene.cameras.main.setZoom(1.2);
  scene.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
  cursors = scene.input.keyboard.createCursorKeys();
  wasd = scene.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D
  });
  setupSocketEvents(scene);
  GameState.socket.emit('player:join', { name: GameState.playerName, avatar: GameState.playerAvatar });
  setupChat();
  window.addEventListener('resize', () => { if(phaserGame) phaserGame.scale.resize(window.innerWidth, window.innerHeight); });
}

function drawOfficeMap(scene) {
  const g = scene.add.graphics();

  // Fundo geral
  g.fillStyle(0x16213e); g.fillRect(0,0,MAP_WIDTH,MAP_HEIGHT);

  // Grid sutil
  g.lineStyle(1,0x0f3460,0.3);
  for(let x=0;x<MAP_WIDTH;x+=32) g.lineBetween(x,0,x,MAP_HEIGHT);
  for(let y=0;y<MAP_HEIGHT;y+=32) g.lineBetween(0,y,MAP_WIDTH,y);

  // RECEPCAO
  g.fillStyle(0x0f3460,0.8); g.fillRect(50,50,300,200);
  g.lineStyle(2,0x4ecdc4,0.6); g.strokeRect(50,50,300,200);

  // Balcao de recepcao - mais detalhado
  g.fillStyle(0x1b4332); g.fillRect(90,85,200,50);
  g.fillStyle(0x2d6a4f); g.fillRect(92,87,196,46);
  g.fillStyle(0x52b788); g.fillRect(92,87,196,14);
  g.fillStyle(0x40916c); g.fillRect(92,101,196,6);
  // Monitor na recepcao
  g.fillStyle(0x0d0d14); g.fillRect(165,70,50,30);
  g.fillStyle(0x7c6dfa); g.fillRect(167,72,46,24);
  g.fillStyle(0x2d2d2d); g.fillRect(185,100,12,8);
  g.fillStyle(0x3d3d3d); g.fillRect(178,108,26,4);

  // Cadeiras recepcao - mais detalhadas
  const chairColor = 0x5a4fcf;
  const chairDark = 0x3d35a0;
  [[80,155],[118,155],[165,155],[210,155],[255,155]].forEach(([x,y]) => {
    g.fillStyle(chairDark); g.fillRect(x,y,28,6);
    g.fillStyle(chairColor); g.fillRect(x,y+6,28,22);
    g.fillStyle(chairDark); g.fillRect(x+2,y+28,6,8);
    g.fillStyle(chairDark); g.fillRect(x+20,y+28,6,8);
    g.fillStyle(0x6a5fd6); g.fillRect(x+2,y+8,24,16);
  });

  // Plantas
  drawPlant(g, 60,58); drawPlant(g, 318,58);
  drawPlant(g, 60,195); drawPlant(g, 318,195);

  // AREA ABERTA
  g.fillStyle(0x0d2137,0.8); g.fillRect(50,300,500,400);
  g.lineStyle(2,0x95e1d3,0.4); g.strokeRect(50,300,500,400);

  // Mesas de trabalho melhoradas
  const deskPositions = [
    [75,345],[195,345],[315,345],[415,345],
    [75,455],[195,455],[315,455],[415,455],
    [75,565],[195,565],[315,565],[415,565],
  ];
  deskPositions.forEach(([dx,dy]) => drawImprovedDesk(g, dx, dy));

  // SALA DE REUNIAO
  g.fillStyle(0x1a0a2e,0.9); g.fillRect(600,50,350,300);
  g.lineStyle(2,0xf38181,0.7); g.strokeRect(600,50,350,300);

  // Mesa de reuniao melhorada - oval/redonda
  g.fillStyle(0x2d1b3d); g.fillRect(635,105,270,130);
  g.fillStyle(0x3d2b4d); g.fillRect(637,107,266,126);
  g.fillStyle(0x4a1942); g.fillRect(640,110,260,120);
  // Reflexo na mesa
  g.fillStyle(0x5a2952,0.5); g.fillRect(642,112,120,10);

  // Cadeiras ao redor da mesa de reuniao
  const meetChairColor = 0xc0392b;
  const meetChairDark = 0x922b21;
  // Cadeiras em cima
  for(let cx=655;cx<=860;cx+=45) {
    g.fillStyle(meetChairDark); g.fillRect(cx,93,30,6);
    g.fillStyle(meetChairColor); g.fillRect(cx,99,30,20);
    g.fillStyle(meetChairDark); g.fillRect(cx+3,86,6,8);
    g.fillStyle(meetChairDark); g.fillRect(cx+21,86,6,8);
  }
  // Cadeiras embaixo
  for(let cx=655;cx<=860;cx+=45) {
    g.fillStyle(meetChairDark); g.fillRect(cx,232,30,6);
    g.fillStyle(meetChairColor); g.fillRect(cx,238,30,20);
    g.fillStyle(meetChairDark); g.fillRect(cx+3,258,6,8);
    g.fillStyle(meetChairDark); g.fillRect(cx+21,258,6,8);
  }
  // Cadeiras nos lados
  g.fillStyle(meetChairDark); g.fillRect(620,125,6,30); g.fillStyle(meetChairColor); g.fillRect(626,125,20,30);
  g.fillStyle(meetChairDark); g.fillRect(620,175,6,30); g.fillStyle(meetChairColor); g.fillRect(626,175,20,30);
  g.fillStyle(meetChairDark); g.fillRect(904,125,6,30); g.fillStyle(meetChairColor); g.fillRect(884,125,20,30);
  g.fillStyle(meetChairDark); g.fillRect(904,175,6,30); g.fillStyle(meetChairColor); g.fillRect(884,175,20,30);

  // Tela de projecao melhorada
  g.fillStyle(0x1a1a2e); g.fillRect(655,248,230,85);
  g.fillStyle(0xfafafa,0.95); g.fillRect(658,250,224,80);
  g.fillStyle(0xe8e8e8); g.fillRect(658,250,224,20);
  g.fillStyle(0xf38181,0.3); g.fillRect(660,252,80,16);
  g.fillStyle(0x7c6dfa,0.3); g.fillRect(745,252,60,16);

  // Plantas sala reuniao
  drawPlant(g, 608,58); drawPlant(g, 908,58);
  drawPlant(g, 608,290); drawPlant(g, 908,290);

  // SALA PRIVADA
  g.fillStyle(0x1a0a1a,0.9); g.fillRect(600,400,350,300);
  g.lineStyle(2,0xa29bfe,0.7); g.strokeRect(600,400,350,300);

  // Mesa privada melhorada
  g.fillStyle(0x1a0a2e); g.fillRect(635,450,130,90);
  g.fillStyle(0x2d1b69); g.fillRect(637,452,126,86);
  g.fillStyle(0x3d2b79); g.fillRect(639,454,122,82);
  // Monitor privado
  g.fillStyle(0x0d0d14); g.fillRect(670,440,60,35);
  g.fillStyle(0xa29bfe); g.fillRect(672,442,56,30);
  g.fillStyle(0x2d2d2d); g.fillRect(695,475,14,8);
  g.fillStyle(0x3d3d3d); g.fillRect(688,483,28,4);
  // Cadeira privada
  g.fillStyle(0x4a237a); g.fillRect(680,542,40,6);
  g.fillStyle(0x6b35a3); g.fillRect(680,548,40,25);
  g.fillStyle(0x4a237a); g.fillRect(683,573,8,10);
  g.fillStyle(0x4a237a); g.fillRect(709,573,8,10);

  // Sofa melhorado
  g.fillStyle(0x2d1b4e); g.fillRect(790,445,145,70);
  g.fillStyle(0x4a237a); g.fillRect(792,447,141,66);
  g.fillStyle(0x5d2d8a); g.fillRect(792,447,141,18);
  g.fillStyle(0x792d9a); g.fillRect(794,449,137,14);
  g.fillStyle(0x4a237a); g.fillRect(792,447,18,66);
  g.fillStyle(0x5d2d8a); g.fillRect(792,449,14,62);
  // Almofadas
  g.fillStyle(0x9b59b6); g.fillRect(815,460,30,40);
  g.fillStyle(0x8e44ad); g.fillRect(817,462,26,36);
  g.fillStyle(0x9b59b6); g.fillRect(855,460,30,40);
  g.fillStyle(0x8e44ad); g.fillRect(857,462,26,36);
  // Mesa de centro
  g.fillStyle(0x2d1b3d); g.fillRect(810,520,80,30);
  g.fillStyle(0x3d2b4d); g.fillRect(812,522,76,26);

  // Plantas sala privada
  drawPlant(g, 608,408); drawPlant(g, 908,408);
  drawPlant(g, 608,658); drawPlant(g, 908,658);

  // Separadores
  g.lineStyle(4,0x1a1a2e,1);
  g.lineBetween(50,260,580,260);
  g.lineBetween(570,50,570,720);

  // Portas
  g.lineStyle(3,0x4ecdc4,0.9);
  g.lineBetween(190,258,270,258);
  g.lineStyle(3,0xf38181,0.9);
  g.lineBetween(700,352,780,352);
  g.lineStyle(3,0xa29bfe,0.9);
  g.lineBetween(700,398,780,398);

  // Labels
  const lbl = { fontFamily:'monospace', fontSize:'11px', color:'#888899' };
  scene.add.text(200,62,'// RECEPCAO',lbl).setOrigin(0.5,0);
  scene.add.text(300,312,'// AREA ABERTA',lbl).setOrigin(0.5,0);
  scene.add.text(775,62,'// SALA DE REUNIAO',{...lbl,color:'#f38181'}).setOrigin(0.5,0);
  scene.add.text(775,412,'// SALA PRIVADA',{...lbl,color:'#a29bfe'}).setOrigin(0.5,0);
}

function drawPlant(g, x, y) {
  // Vaso
  g.fillStyle(0x8B4513); g.fillRect(x+3,y+10,10,8);
  g.fillStyle(0xa0522d); g.fillRect(x+2,y+8,12,4);
  // Terra
  g.fillStyle(0x3d2b1f); g.fillRect(x+3,y+10,10,3);
  // Folhas
  g.fillStyle(0x1b4332); g.fillRect(x,y,6,12);
  g.fillStyle(0x2d6a4f); g.fillRect(x+2,y-4,5,10);
  g.fillStyle(0x52b788); g.fillRect(x+4,y-8,5,12);
  g.fillStyle(0x40916c); g.fillRect(x+8,y-2,6,10);
  g.fillStyle(0x2d6a4f); g.fillRect(x+10,y+2,5,8);
}

function drawImprovedDesk(g, x, y) {
  // Sombra da mesa
  g.fillStyle(0x000000,0.2); g.fillRect(x+3,y+3,86,54);
  // Tampo da mesa
  g.fillStyle(0x1a2744); g.fillRect(x,y,86,50);
  g.fillStyle(0x2d3561); g.fillRect(x,y,84,48);
  g.fillStyle(0x3d4571); g.fillRect(x,y,84,6);
  // Monitor
  g.fillStyle(0x0a0a12); g.fillRect(x+18,y-28,48,28);
  g.fillStyle(0x111122); g.fillRect(x+20,y-26,44,24);
  g.fillStyle(0x1a1a3e); g.fillRect(x+22,y-24,40,20);
  // Tela do monitor com conteudo
  g.fillStyle(0x7c6dfa,0.8); g.fillRect(x+22,y-24,40,8);
  g.fillStyle(0x4ecdc4,0.5); g.fillRect(x+22,y-15,25,3);
  g.fillStyle(0x4ecdc4,0.3); g.fillRect(x+22,y-11,35,3);
  g.fillStyle(0x4ecdc4,0.3); g.fillRect(x+22,y-7,20,3);
  // Pe do monitor
  g.fillStyle(0x1a1a2e); g.fillRect(x+38,y,8,5);
  g.fillStyle(0x2a2a3e); g.fillRect(x+32,y+5,20,3);
  // Teclado
  g.fillStyle(0x252540); g.fillRect(x+10,y+28,55,14);
  g.fillStyle(0x2d2d50); g.fillRect(x+11,y+29,53,12);
  for(let kx=0;kx<5;kx++) for(let ky=0;ky<2;ky++) {
    g.fillStyle(0x3d3d60); g.fillRect(x+13+kx*10,y+31+ky*5,8,4);
  }
  // Mouse
  g.fillStyle(0x252540); g.fillRect(x+68,y+30,12,16);
  g.fillStyle(0x3d3d60); g.fillRect(x+69,y+31,10,7);
  g.fillStyle(0x4a4a70); g.fillRect(x+74,y+31,1,7);
  // Cadeira melhorada
  g.fillStyle(0x1a1a2e); g.fillRect(x+20,y+55,44,6);
  g.fillStyle(0x2d2d4e); g.fillRect(x+20,y+61,44,24);
  g.fillStyle(0x3d3d5e); g.fillRect(x+22,y+63,40,20);
  // Rodinhas
  g.fillStyle(0x1a1a2e); g.fillRect(x+20,y+85,8,5);
  g.fillStyle(0x1a1a2e); g.fillRect(x+56,y+85,8,5);
  g.fillStyle(0x1a1a2e); g.fillRect(x+38,y+85,8,5);
}

function createPlayerSprite(scene, x, y, palette, isLocal) {
  const container = scene.add.container(x, y);
  const texKey = 'player_'+palette.shirt+'_'+palette.hair;
  if (!scene.textures.exists(texKey)) {
    const rt = scene.add.renderTexture(0,0,24,36);
    const g2 = scene.add.graphics();
    const px = 3;
    const d = (col,row,color) => { g2.fillStyle(color,1); g2.fillRect(col*px,row*px,px,px); };
    for(let c=1;c<=4;c++) for(let r=0;r<=3;r++) d(c,r,hexStringToNum(palette.skin));
    for(let c=1;c<=4;c++) d(c,0,hexStringToNum(palette.hair));
    d(1,1,hexStringToNum(palette.hair)); d(4,1,hexStringToNum(palette.hair));
    d(2,2,0x000000); d(3,2,0x000000);
    for(let c=1;c<=4;c++) for(let r=4;r<=6;r++) d(c,r,hexStringToNum(palette.shirt));
    d(0,4,hexStringToNum(palette.shirt)); d(5,4,hexStringToNum(palette.shirt));
    for(let c=1;c<=2;c++) for(let r=7;r<=9;r++) d(c,r,hexStringToNum(palette.pants));
    for(let c=3;c<=4;c++) for(let r=7;r<=9;r++) d(c,r,hexStringToNum(palette.pants));
    rt.draw(g2,0,0); rt.saveTexture(texKey);
    g2.destroy(); rt.destroy();
  }
  const shadow = scene.add.ellipse(0,18,18,6,0x000000,0.3);
  const sprite = scene.add.image(0,0,texKey);
  sprite.setScale(1.5);
  const nameLabel = scene.add.text(0,-28,isLocal ? GameState.playerName : '',{
    fontFamily:'monospace', fontSize:'9px', color: isLocal ? '#7c6dfa' : '#e8e8f0',
    stroke:'#0d0d14', strokeThickness:3
  }).setOrigin(0.5,1);
  container.add([shadow, sprite, nameLabel]);
  container.nameLabel = nameLabel;
  return container;
}

function updateScene() {
  if (!localPlayer || !localPlayer.body) return;
  const body = localPlayer.body;
  let vx=0, vy=0, moving=false, direction='down';
  if (cursors.left.isDown  || wasd.left.isDown)  { vx=-160; direction='left';  moving=true; }
  else if (cursors.right.isDown || wasd.right.isDown) { vx=160;  direction='right'; moving=true; }
  if (cursors.up.isDown    || wasd.up.isDown)    { vy=-160; direction='up';    moving=true; }
  else if (cursors.down.isDown  || wasd.down.isDown)  { vy=160;  direction='down';  moving=true; }
  body.setVelocity(vx, vy);
  if (moving) localPlayer.y += Math.sin(Date.now()*0.012)*0.3;
  const now=Date.now(), x=Math.round(localPlayer.x), y=Math.round(localPlayer.y);
  if (now-lastSentTime>50 && (x!==lastSentX || y!==lastSentY || moving)) {
    GameState.socket.emit('player:move',{x,y,direction,moving});
    lastSentX=x; lastSentY=y; lastSentTime=now;
  }
  for (const [id,data] of Object.entries(otherPlayers)) {
    if (data.container && data.targetX!==undefined) {
      data.container.x += (data.targetX-data.container.x)*0.15;
      data.container.y += (data.targetY-data.container.y)*0.15;
    }
  }
}

function setupSocketEvents(scene) {
  const socket = GameState.socket;
  socket.on('players:list', (players) => {
    for (const [id,player] of Object.entries(players)) {
      if (id===socket.id) continue;
      addOtherPlayer(scene, id, player);
    }
    updateOnlineCount();
  });
  socket.on('player:joined', (player) => {
    if (player.id===socket.id) return;
    addOtherPlayer(scene, player.id, player);
    addChatMessage('sistema', player.name+' entrou no escritorio');
    updateOnlineCount();
  });
  socket.on('player:moved', (data) => {
    if (otherPlayers[data.id]) {
      otherPlayers[data.id].targetX=data.x;
      otherPlayers[data.id].targetY=data.y;
      otherPlayers[data.id].moving=data.moving;
    }
  });
  socket.on('player:left', (data) => {
    if (otherPlayers[data.id]) {
      const name=otherPlayers[data.id].name;
      otherPlayers[data.id].container.destroy();
      delete otherPlayers[data.id];
      addChatMessage('sistema', name+' saiu');
      updateOnlineCount();
    }
    closePeerConnection(data.id);
  });
  socket.on('player:zone_changed', (data) => {
    GameState.currentZone=data.zone;
    showZoneNotification(data.zoneName);
    document.getElementById('hud-zone-name').textContent=data.zoneName;
    updateVoiceConnections(data.zone);
  });
  socket.on('player:zone_update', (data) => {
    if (otherPlayers[data.playerId]) otherPlayers[data.playerId].zone=data.newZone;
    updateVoiceConnections(GameState.currentZone);
  });
  socket.on('chat:message', (msg) => addChatMessage(msg.playerName, msg.text));
  socket.on('webrtc:offer', async ({fromId,offer}) => await handleWebRTCOffer(fromId,offer));
  socket.on('webrtc:answer', async ({fromId,answer}) => {
    const pc=GameState.peerConnections[fromId];
    if(pc) await pc.setRemoteDescription(new RTCSessionDescription(answer));
  });
  socket.on('webrtc:ice_candidate', async ({fromId,candidate}) => {
    const pc=GameState.peerConnections[fromId];
    if(pc&&candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate));
  });
}

function addOtherPlayer(scene, id, playerData) {
  const palette=AVATAR_PALETTES[playerData.avatar]||AVATAR_PALETTES.avatar1;
  const container=createPlayerSprite(scene,playerData.x,playerData.y,palette,false);
  container.nameLabel.setText(playerData.name);
  otherPlayers[id]={container,name:playerData.name,avatar:playerData.avatar,targetX:playerData.x,targetY:playerData.y,zone:playerData.zone,moving:false};
}

let zoneNotifTimeout=null;
function showZoneNotification(zoneName) {
  const el=document.getElementById('zone-notification');
  el.textContent='► '+zoneName;
  el.classList.add('visible');
  clearTimeout(zoneNotifTimeout);
  zoneNotifTimeout=setTimeout(()=>el.classList.remove('visible'),3000);
}

function setupChat() {
  const input=document.getElementById('chat-input');
  const sendMsg=()=>{
    const text=input.value.trim();
    if(!text) return;
    GameState.socket.emit('chat:message',{text});
    input.value='';
  };
  document.getElementById('chat-send').onclick=sendMsg;
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){sendMsg();} e.stopPropagation(); });
}

function addChatMessage(author,text) {
  const container=document.getElementById('chat-messages');
  const div=document.createElement('div');
  if(author==='sistema'){div.className='chat-msg system';div.textContent='› '+text;}
  else{div.className='chat-msg';div.innerHTML='<span class="msg-author">['+author+']</span> <span>'+text+'</span>';}
  container.appendChild(div);
  container.scrollTop=container.scrollHeight;
}

function updateOnlineCount() {
  document.getElementById('online-num').textContent=Object.keys(otherPlayers).length+1;
}

async function initAudio() {
  try {
    GameState.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
    document.getElementById('audio-icon').textContent='🎤';
    document.getElementById('audio-zone-label').textContent='Recepcao';
    document.getElementById('mute-btn').onclick=toggleMute;
  } catch(err) {
    document.getElementById('audio-icon').textContent='🚫';
    document.getElementById('audio-zone-label').textContent='Sem audio';
  }
}

function toggleMute() {
  if(!GameState.localStream) return;
  GameState.isMuted=!GameState.isMuted;
  GameState.localStream.getAudioTracks().forEach(t=>t.enabled=!GameState.isMuted);
  document.getElementById('mute-btn').textContent=GameState.isMuted?'ATIVO':'MUDO';
  document.getElementById('audio-icon').textContent=GameState.isMuted?'🔇':'🎤';
}

function updateVoiceConnections(currentZone) {
  document.getElementById('audio-zone-label').textContent=ZONES[currentZone]?.name||currentZone;
  for(const [peerId] of Object.entries(GameState.peerConnections)){
    if(otherPlayers[peerId]?.zone!==currentZone) closePeerConnection(peerId);
  }
  for(const [peerId,playerData] of Object.entries(otherPlayers)){
    if(playerData.zone===currentZone&&!GameState.peerConnections[peerId]) initiateWebRTCCall(peerId);
  }
}

async function initiateWebRTCCall(targetId) {
  if(!GameState.localStream) return;
  const pc=createPeerConnection(targetId);
  try {
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    GameState.socket.emit('webrtc:offer',{targetId,offer:pc.localDescription});
  } catch(err){console.error(err);}
}

async function handleWebRTCOffer(fromId,offer) {
  if(!GameState.localStream) return;
  const pc=createPeerConnection(fromId);
  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    GameState.socket.emit('webrtc:answer',{targetId:fromId,answer:pc.localDescription});
  } catch(err){console.error(err);}
}

function createPeerConnection(peerId) {
  const pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});
  GameState.peerConnections[peerId]=pc;
  if(GameState.localStream) GameState.localStream.getTracks().forEach(t=>pc.addTrack(t,GameState.localStream));
  pc.ontrack=(e)=>{
    const audio=new Audio();
    audio.srcObject=e.streams[0];
    audio.autoplay=true;
    document.body.appendChild(audio);
    GameState.remoteAudios[peerId]=audio;
  };
  pc.onicecandidate=(e)=>{
    if(e.candidate) GameState.socket.emit('webrtc:ice_candidate',{targetId:peerId,candidate:e.candidate});
  };
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='disconnected'||pc.connectionState==='failed') closePeerConnection(peerId);
  };
  return pc;
}

function closePeerConnection(peerId) {
  if(GameState.peerConnections[peerId]){GameState.peerConnections[peerId].close();delete GameState.peerConnections[peerId];}
  if(GameState.remoteAudios[peerId]){GameState.remoteAudios[peerId].remove();delete GameState.remoteAudios[peerId];}
}

document.addEventListener('DOMContentLoaded',()=>{
  drawAllPreviews();
  createParticles();
  initSocket();
  document.getElementById('player-name').addEventListener('keydown',(e)=>{ if(e.key==='Enter') enterOffice(); });
  document.getElementById('btn-enter').disabled=true;
});
