# 🏢 Virtual Office

> Escritório virtual multiplayer estilo Gather Town — Phaser.js + Socket.io + WebRTC

![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)
![Socket.io](https://img.shields.io/badge/Socket.io-4.x-white)
![Phaser](https://img.shields.io/badge/Phaser-3.60-blue)

---

## 📸 O que você vai ter

- **Mapa 2D pixel art** com 4 zonas: Recepção, Área Aberta, Sala de Reunião, Sala Privada
- **Múltiplos jogadores** em tempo real via Socket.io
- **3 avatares** gerados programaticamente (pixel art)
- **Movimentação** com WASD ou setas
- **Áudio por sala** via WebRTC — só ouve quem está na mesma zona
- **Chat** por sala
- **Detecção automática de zona** com notificação visual

---

## 📁 Estrutura do Projeto

```
virtual-office/
├── package.json          # Dependências Node.js
├── .gitignore
├── README.md
├── server/
│   └── server.js         # Backend: Express + Socket.io
└── client/
    ├── index.html        # Frontend: tela de login + HUD
    └── main.js           # Lógica: Phaser.js + WebRTC + Socket.io client
```

---

## 🚀 Rodando Localmente

### Pré-requisitos
- **Node.js 16+** → [nodejs.org](https://nodejs.org)

### Passo a passo

```bash
# 1. Entre na pasta do projeto
cd virtual-office

# 2. Instale as dependências
npm install

# 3. Inicie o servidor
npm start

# Para desenvolvimento (auto-restart):
npm run dev
```

### 4. Abra no navegador
```
http://localhost:3000
```

Para testar multiplayer, abra **duas abas ou dois navegadores** na mesma URL.

---

## 🌐 Subindo Online

### Opção 1: Replit (mais fácil)

1. Acesse [replit.com](https://replit.com) e crie uma conta
2. Clique em **+ Create Repl** → **Import from GitHub** (ou cole o código)
3. No arquivo `package.json`, o script `start` já está configurado
4. Clique em **Run**
5. Replit vai gerar uma URL pública automaticamente

> ⚠️ No Replit, o WebRTC pode precisar de um servidor TURN para funcionar em produção. Para uso básico/testes, os servidores STUN do Google já são suficientes.

### Opção 2: Railway

```bash
# Instale a CLI
npm install -g @railway/cli

# Login e deploy
railway login
railway init
railway up
```

### Opção 3: Render.com

1. Conecte seu GitHub ao [render.com](https://render.com)
2. Crie um **Web Service**
3. Configure:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Deploy automático!

---

## 🎮 Controles

| Tecla | Ação |
|-------|------|
| `W` / `↑` | Mover para cima |
| `S` / `↓` | Mover para baixo |
| `A` / `←` | Mover para esquerda |
| `D` / `→` | Mover para direita |
| `Enter` (no chat) | Enviar mensagem |

---

## 🗺️ Zonas do Mapa

| Zona | Coordenadas | Cor |
|------|-------------|-----|
| Recepção | x:50 y:50 (300×200) | Ciano |
| Área Aberta | x:50 y:300 (500×400) | Verde-água |
| Sala de Reunião | x:600 y:50 (350×300) | Vermelho-coral |
| Sala Privada | x:600 y:400 (350×300) | Roxo |

> Para modificar as zonas, edite o objeto `ZONES` em **ambos** `server/server.js` e `client/main.js`.

---

## 🔊 Como o WebRTC funciona

```
Jogador A entra na Sala de Reunião
    ↓
Servidor emite player:zone_update para todos
    ↓
Jogador B (já na Sala de Reunião) recebe o evento
    ↓
Jogador B chama initiateWebRTCCall(playerA.id)
    ↓
Troca de offer/answer via Socket.io (sinalização)
    ↓
Conexão P2P estabelecida via STUN (Google)
    ↓
🔊 Áudio flui diretamente entre os dois
    ↓
Jogador A sai da sala → closePeerConnection()
    ↓
🔇 Áudio cortado automaticamente
```

---

## 🛠️ Personalizando

### Adicionar novo avatar
Em `client/main.js`, adicione na constante `AVATAR_PALETTES`:
```javascript
avatar4: { skin: '#fce4ec', hair: '#880e4f', shirt: '#e91e63', pants: '#1a1a2e' },
```

E no `index.html`, adicione mais um `<label class="avatar-option">`.

### Adicionar nova zona
Em **ambos** `server/server.js` e `client/main.js`:
```javascript
nova_zona: { x: 400, y: 400, w: 200, h: 150, name: 'Nova Sala', color: 0xffcc00 }
```

### Mudar velocidade do personagem
Em `client/main.js`:
```javascript
let moveSpeed = 160; // pixels por segundo
```

### Mudar porta do servidor
```bash
PORT=8080 npm start
```

---

## 🔮 Melhorias Futuras Sugeridas

### Curto prazo
- [ ] **Tilemap com Tiled** — importar mapas `.json` criados no Tiled Editor
- [ ] **Mais animações** — spritesheet com walk cycle real (4 direções)
- [ ] **Interação com objetos** — pressionar `E` perto de uma mesa abre algo
- [ ] **Status online** — ícone de disponível/ocupado/ausente

### Médio prazo
- [ ] **Servidor TURN** (Coturn) — para WebRTC funcionar 100% em produção/NAT
- [ ] **Vídeo** — além de áudio, mostrar webcam em miniatura
- [ ] **Salas com senha** — sala privada só abre com código
- [ ] **Persistência** — salvar posição/preferências com Redis
- [ ] **Moderação** — kick, ban, mute de outros usuários

### Longo prazo
- [ ] **Editor de mapa** — arrastar móveis em tempo real
- [ ] **Screenshare** — compartilhar tela dentro de uma sala
- [ ] **Whiteboard colaborativo** — canvas compartilhado na sala de reunião
- [ ] **Autenticação** — login com Google/GitHub
- [ ] **Múltiplos escritórios** — criar e gerenciar vários espaços

---

## 📦 Dependências

```json
{
  "express": "^4.18.2",    // Servidor HTTP
  "socket.io": "^4.7.2"   // WebSocket multiplayer
}
```

**Front-end** (via CDN, sem instalação):
- Phaser.js 3.60 — motor do jogo 2D
- Socket.io client — auto-servido pelo backend

---

## ⚡ Dicas de Performance

1. O servidor emite movimentos apenas para outros jogadores (`socket.broadcast.emit`), não para o próprio jogador
2. O cliente faz throttle de 20fps (50ms) no envio de posição
3. A interpolação suave dos outros jogadores usa lerp (0.15) para movimento fluido
4. Texturas dos avatares são geradas uma vez e cacheadas (`scene.textures.exists()`)

---

## 🐛 Problemas Comuns

**"Microfone não disponível"**
→ O WebRTC exige HTTPS em produção. Localmente (`localhost`) funciona sem HTTPS.

**Jogadores não aparecem**
→ Verifique se o servidor está rodando e o Socket.io está conectado (veja console do browser).

**WebRTC não conecta em produção**
→ Configure um servidor TURN. O STUN do Google só funciona quando os peers têm IPs públicos.

---

Feito com 🎮 Phaser.js, ⚡ Socket.io e 🔊 WebRTC
