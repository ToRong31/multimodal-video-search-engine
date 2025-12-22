// VERSION: Final - Handles Image Messages
const fs = require('fs');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const HISTORY_DIR = path.join(__dirname, 'chat-history');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history.json');

if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

function ensureRoom(roomName) {
  if (!rooms[roomName]) rooms[roomName] = new Map();
  return rooms[roomName];
}

function broadcastToRoom(roomName, obj, excludeWs = null) {
  const set = ensureRoom(roomName); // Map<clientId, ws>
  if (!set || set.size === 0) return;

  const payload = JSON.stringify(obj);
  for (const wsClient of set.values()) {
    if (wsClient.readyState === WebSocket.OPEN && wsClient !== excludeWs) {
      wsClient.send(payload);
    }
  }
}

function readHistory() {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    // Back-compat: old format was a single array -> migrate to { default: [...] }
    if (Array.isArray(parsed)) return { default: parsed };
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return { default: [] };
}

function writeHistory(obj) {
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj, null, 2), 'utf8');
}

// In-memory rooms and histories
// rooms: { [roomName]: Map<clientId, ws> }
const rooms = {};
let chatRooms = readHistory();

const server = http.createServer();
const wss = new WebSocket.Server({ server });

// Broadcast to every connected client (regardless of room)
function broadcastToAllClients(payload) {
  const msg = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`WS client connected: ${clientIp}`);

  // Send snapshot of all rooms + histories
  ws.send(JSON.stringify({
    type: 'snapshot',
    rooms: Object.keys(chatRooms),
    histories: chatRooms
  }));

  ws.on('message', (message) => {
    let data;
    try { data = JSON.parse(message); } catch (e) { return; }

    const { room: roomName = 'default', clientId } = data;

    if (data.type === 'join') {
      if (!rooms[roomName]) rooms[roomName] = new Map();
      rooms[roomName].set(clientId, ws);
      if (!chatRooms[roomName]) chatRooms[roomName] = [];
      // Send history to the joiner
      try {
        ws.send(JSON.stringify({
          type: 'room_history',
          room: roomName,
          history: chatRooms[roomName] || []
        }));
      } catch {}
      return;
    }

    switch (data.type) {
      case 'create_room': {
        const r = (data.room || '').trim();
        if (!r || chatRooms[r]) return;
        chatRooms[r] = [];
        writeHistory(chatRooms);
        // Notify all clients so their dropdown refreshes
        broadcastToAllClients({ type: 'room_created', room: r });
        break;
      }

      case 'delete_room': {
        const r = (data.room || '').trim();
        if (!r || r === 'default' || !chatRooms[r]) return;
        delete chatRooms[r];
        // Remove sockets map but broadcast to all clients (not via rooms)
        if (rooms[r]) delete rooms[r];
        writeHistory(chatRooms);
        broadcastToAllClients({ type: 'room_deleted', room: r });
        break;
      }

      case 'delete_all_rooms': {
        chatRooms = { default: [] };
        // Drop all room socket maps except default
        for (const r in rooms) {
          if (r !== 'default') delete rooms[r];
        }
        writeHistory(chatRooms);
        // IMPORTANT: broadcast to ALL clients, not by rooms
        broadcastToAllClients({
          type: 'rooms_reset',
          rooms: Object.keys(chatRooms),
          histories: chatRooms
        });
        break;
      }

      case 'clear': {
        const r = (data.room || '').trim();
        if (!r || r.toLowerCase() === 'all' || r === '_all') {
          for (const k of Object.keys(chatRooms)) chatRooms[k] = [];
          writeHistory(chatRooms);
          // Notify all clients
          broadcastToAllClients({ type: 'clear', room: '_all' });
        } else {
          if (!chatRooms[r]) chatRooms[r] = [];
          chatRooms[r] = [];
          writeHistory(chatRooms);
          // Per-room clear stays room-scoped
          broadcastToRoom(r, { type: 'clear', room: r });
        }
        break;
      }

      case 'get_history': {
        const r = (data.room || 'default').trim() || 'default';
        if (!chatRooms[r]) chatRooms[r] = [];
        try {
          ws.send(JSON.stringify({
            type: 'room_history',
            room: r,
            history: chatRooms[r]
          }));
        } catch {}
        break;
      }

      case 'message':
      case 'image_message': {
        const r = roomName || 'default';
        data.ts = Date.now();
        data.room = r;
        if (!chatRooms[r]) chatRooms[r] = [];
        chatRooms[r].push(data);
        writeHistory(chatRooms);
        broadcastToRoom(r, data);
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    console.log(`WS client disconnected: ${clientIp}`);
    for (const roomName in rooms) {
      const room = rooms[roomName];
      for (const [cid, clientWs] of room.entries()) {
        if (clientWs === ws) {
          room.delete(cid);
          console.log(`Client removed from room ${roomName}. New size: ${room.size}`);
          break;
        }
      }
    }
  });

  ws.on('error', (error) => console.error('WebSocket error:', error));
});

const PORT = Number(process.env.PORT || process.env.CHAT_PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Realtime server running on ws://${HOST}:${PORT}`);
});