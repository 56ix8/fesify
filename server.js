/* Fesify - Express server (local dev + Vercel). API logic lives in lib/api.js, shared with the Cloudflare worker. */
const express = require('express');
const path = require('path');
const api = require('./lib/api');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* bridge each shared API route: web Response -> Express response */
for (const route of Object.keys(api.routes)) {
  app.get(`/api/${route}`, async (req, res) => {
    const r = await api.handle(route, new URL(req.originalUrl, 'http://localhost').searchParams);
    res.status(r.status);
    r.headers.forEach((v, k) => res.setHeader(k, v));
    res.send(Buffer.from(await r.arrayBuffer()));
  });
}

/* Listen Together Live Sync Rooms */
const activeRooms = new Map();

app.post('/api/room/create', (req, res) => {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  const hostKey = Math.random().toString(36).substring(2, 12);
  const roomData = {
    roomId,
    hostKey,
    createdAt: Date.now(),
    currentTrack: null,
    currentTime: 0,
    isPlaying: false,
    updatedAt: Date.now(),
    listeners: new Set(),
  };
  activeRooms.set(roomId, roomData);
  res.json({ roomId, hostKey });
});

app.get('/api/room/:roomId/state', (req, res) => {
  const room = activeRooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    roomId: room.roomId,
    currentTrack: room.currentTrack,
    currentTime: room.currentTime,
    isPlaying: room.isPlaying,
    updatedAt: room.updatedAt,
    listenerCount: room.listeners.size + 1,
  });
});

app.post('/api/room/:roomId/sync', (req, res) => {
  const room = activeRooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { currentTrack, currentTime, isPlaying } = req.body;
  if (currentTrack !== undefined) room.currentTrack = currentTrack;
  if (currentTime !== undefined) room.currentTime = currentTime;
  if (isPlaying !== undefined) room.isPlaying = isPlaying;
  room.updatedAt = Date.now();

  // Broadcast to SSE clients
  const payload = `data: ${JSON.stringify({
    currentTrack: room.currentTrack,
    currentTime: room.currentTime,
    isPlaying: room.isPlaying,
    updatedAt: room.updatedAt,
  })}\n\n`;

  for (const client of room.listeners) {
    try {
      client.write(payload);
    } catch {
      room.listeners.delete(client);
    }
  }

  res.json({ success: true });
});

app.get('/api/room/:roomId/events', (req, res) => {
  const room = activeRooms.get(req.params.roomId.toUpperCase());
  if (!room) return res.status(404).end();

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  room.listeners.add(res);

  // Send initial state
  res.write(
    `data: ${JSON.stringify({
      currentTrack: room.currentTrack,
      currentTime: room.currentTime,
      isPlaying: room.isPlaying,
      updatedAt: room.updatedAt,
    })}\n\n`
  );

  req.on('close', () => {
    room.listeners.delete(res);
  });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found' }));

app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => console.log(`Fesify running on :${PORT}`));
}
module.exports = app;
