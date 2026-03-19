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
  reception:    { x:50,  y:50,  w:300, h:200, name:'Recepção' },
  open_area:    { x:50,  y:300, w:500, h:400, name:'Área Aberta' },
  meeting_room: { x:600, y:50,  w:350, h:300, name:'Sala de Reunião' },
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
    document.getElementById('connection-status').textContent = 'Servidor online — pronto para entrar!';
    document.getElementById('btn-enter').disabled = false;
  });
  GameState.socket.on('disconnect', () => {
    document.getElementById('connection-status').textContent = 'Desconectado do servidor';
  });
  GameState.socket.on('connect_error', () => {
    document.getElementById('connection-status').textContent = '⚠️ Erro ao conectar — verifique o servidor';
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
  g.fillStyle(0x16213e); g.fillRect(0,0,MAP_WIDTH,MAP_HEIGHT);
  g.lineStyle(1,0x0f3460,0.3);
  for(let x=0;x<MAP_WIDTH;x+=32) g.lineBetween(x,0,x,MAP_HEIGHT);
  for(let y=0;y<MAP_HEIGHT;y+=32) g.lineBetween(0,y,MAP_WIDTH,y);

  g.fillStyle(0x0f3460,0.8); g.fillRect(50,50,300,200);
  g.lineStyle(2,0x4ecdc4,0.6); g.strokeRect(50,50,300,200);
  g.fillStyle(0x2d6a4f); g.fillRect(100,80,180,40);
  g.fillStyle(0x52b788); g.fillRect(102,82,176,12);
  g.fillStyle(0x7c6dfa);
  [[80,160],[120,160],[200,160]].forEach(([x,y])=>g.fillRect(x,y,24,24));

  g.fillStyle(0x0d2137,0.8); g.fillRect(50,300,500,400);
  g.lineStyle(2,0x95e1d3,0.4); g.strokeRect(50,300,500,400);
  [[80,340],[200,340],[320,340],[420,340],[80,460],[200,460],[320,460],[420,460],[80,580],[200,580],[320,580],[420,580]].forEach(([dx,dy])=>{
    g.fillStyle(0x2d3561); g.fillRect(dx,dy,80,50);
    g.fillStyle(0x0d0d14); g.fillRect(dx+15,dy+5,50,30);
    g.fillStyle(0x7c6dfa); g.fillRect(dx+17,dy+7,46,24);
    g.fillStyle(0x4a4a7a); g.fillRect(dx+28,dy+52,24,20);
  });

  g.fillStyle(0x1a0a2e,0.9); g.fillRect(600,50,350,300);
  g.lineStyle(2,0xf38181,0.7); g.strokeRect(600,50,350,300);
  g.fillStyle(0x4a1942); g.fillRect(650,100,240,120);
  g.fillStyle(0xfafafa,0.9); g.fillRect(670,240,200,90);

  g.fillStyle(0x1a0a1a,0.9); g.fillRect(600,400,350,300);
  g.lineStyle(2,0xa29bfe,0.7); g.strokeRect(600,400,350,300);
  g.fillStyle(0x2d1b69); g.fillRect(650,450,120,80);
  g.fillStyle(0x4a237a); g.fillRect(800,440,130,60);

  g.lineStyle(3,0x2a2a42,1);
  g.lineBetween(50,260,580,260);
  g.lineBetween(570,50,570,720);

  const labelStyle = { fontFamily:'"Space Mono",monospace', fontSize:'11px', color:'#888899' };
  scene.add.text(200,62,'// RECEPÇÃO',labelStyle).setOrigin(0.5,0);
  scene.add.text(300,312,'// ÁREA ABERTA',labelStyle).setOrigin(0.5,0);
  scene.add.text(775,62,'// SALA DE REUNIÃO',{...labelStyle,color:'#f38181'}).setOrigin(0.5,0);
  scene.add.text(775,412,'// SALA PRIVADA',{...labelStyle,color:'#a29bfe'}).setOrigin(0.5,0);
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
    fontFamily:'"Space Mono",monospace', fontSize:'9px', color: isLocal ? '#7c6dfa' : '#e8e8f0',
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
    addChatMessage('sistema', player.name+' entrou no escritório');
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
    document.getElementById('audio-zone-label').textContent='Recepção';
    document.getElementById('mute-btn').onclick=toggleMute;
  } catch(err) {
    document.getElementById('audio-icon').textContent='🚫';
    document.getElementById('audio-zone-label').textContent='Sem áudio';
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
