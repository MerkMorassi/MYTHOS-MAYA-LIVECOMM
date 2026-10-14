import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

app.use(express.json());

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  role: 'host-tv' | 'iphone-mic' | 'viewer';
  deviceName: string;
  connectedAt: number;
}

const clients = new Map<string, ConnectedClient>();

// Initialize WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(message: object, excludeId?: string) {
  const payload = JSON.stringify(message);
  for (const [id, client] of clients.entries()) {
    if (id !== excludeId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function getConnectedDevices() {
  return Array.from(clients.values()).map(c => ({
    id: c.id,
    role: c.role,
    deviceName: c.deviceName,
    connectedAt: c.connectedAt,
  }));
}

wss.on('connection', (ws: WebSocket, req) => {
  const clientId = 'dev_' + Math.random().toString(36).substring(2, 9);
  
  const clientInfo: ConnectedClient = {
    id: clientId,
    ws,
    role: 'viewer',
    deviceName: 'Anonymous Device',
    connectedAt: Date.now(),
  };
  clients.set(clientId, clientInfo);

  // Send initial handshake with client ID
  ws.send(JSON.stringify({
    type: 'init',
    clientId,
    connectedDevices: getConnectedDevices(),
  }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'register') {
        clientInfo.role = msg.role || 'viewer';
        clientInfo.deviceName = msg.deviceName || 'Wireless Device';
        clients.set(clientId, clientInfo);

        // Notify everyone of updated device list
        broadcast({
          type: 'device-list-update',
          connectedDevices: getConnectedDevices(),
          joined: { id: clientId, role: clientInfo.role, deviceName: clientInfo.deviceName },
        });
      } else if (msg.type === 'webrtc-signal') {
        // Relay signaling messages (offers, answers, ICE candidates)
        if (msg.targetId) {
          const target = clients.get(msg.targetId);
          if (target && target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({
              type: 'webrtc-signal',
              senderId: clientId,
              role: clientInfo.role,
              data: msg.data,
            }));
          }
        } else {
          // Broadcast to other peers
          broadcast({
            type: 'webrtc-signal',
            senderId: clientId,
            role: clientInfo.role,
            data: msg.data,
          }, clientId);
        }
      } else if (msg.type === 'audio-chunk') {
        // Relay binary/base64 audio packet for low-latency WebSocket streaming
        broadcast({
          type: 'audio-chunk',
          senderId: clientId,
          role: clientInfo.role,
          sampleRate: msg.sampleRate || 48000,
          channels: msg.channels || 1,
          pcmData: msg.pcmData,
        }, clientId);
      } else if (msg.type === 'transcript') {
        // Relay real-time transcribed text
        broadcast({
          type: 'transcript',
          senderId: clientId,
          senderName: clientInfo.deviceName,
          role: clientInfo.role,
          id: msg.id || ('t_' + Date.now()),
          text: msg.text,
          isFinal: Boolean(msg.isFinal),
          timestamp: msg.timestamp || Date.now(),
        });
      } else if (msg.type === 'intercom-tts') {
        // Relay TTS browser voice trigger to TV or peers
        broadcast({
          type: 'intercom-tts',
          senderId: clientId,
          senderName: clientInfo.deviceName,
          text: msg.text,
          voice: msg.voice,
          timestamp: Date.now(),
        });
      } else if (msg.type === 'turn-state') {
        // Relay intercom turn-taking state synchronization
        broadcast({
          type: 'turn-state',
          senderId: clientId,
          turnState: msg.turnState,
          speaker: msg.speaker,
          activeText: msg.activeText,
          timestamp: Date.now(),
        });
      } else if (msg.type === 'battery-update') {
        // Relay battery level and charging status from iPhone to Host TV and peers
        broadcast({
          type: 'battery-update',
          senderId: clientId,
          level: typeof msg.level === 'number' ? msg.level : 1,
          charging: Boolean(msg.charging),
          timestamp: Date.now(),
        });
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({
          type: 'pong',
          timestamp: msg.timestamp,
          serverTime: Date.now(),
        }));
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    clients.delete(clientId);
    broadcast({
      type: 'device-list-update',
      connectedDevices: getConnectedDevices(),
      left: { id: clientId, role: clientInfo.role, deviceName: clientInfo.deviceName },
    });
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error on client ${clientId}:`, err);
  });
});

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// REST API endpoints
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    timestamp: Date.now(),
    devicesCount: clients.size,
    devices: getConnectedDevices(),
  });
});

app.post('/api/internal-ai/respond', async (req, res) => {
  try {
    const { history, latestUtterance, personaInstruction } = req.body;
    if (!latestUtterance && (!history || history.length === 0)) {
      return res.status(400).json({ error: 'Missing conversation input' });
    }

    const systemInstruction =
      personaInstruction ||
      `You are the Internal Local AI speaking over a studio intercom system in a live conversational turn-taking exchange with a "Black Box" external AI (communicating from an iPhone wireless audio source).
RULES:
1. Speak as a thoughtful, articulate, conversational counterpart.
2. Directly respond to what the Black Box AI said.
3. Keep responses concise, direct, and conversational (1 to 3 sentences max) so they sound crisp and natural when spoken aloud via Browser Voice.
4. Do NOT use markdown formatting, asterisks, bullet points, or emojis, since your output will be directly read aloud.
5. Conclude your turn clearly so the Black Box AI knows it is its turn to speak.`;

    let prompt = '';
    if (history && Array.isArray(history) && history.length > 0) {
      prompt += 'Intercom Dialogue History:\n';
      history.slice(-8).forEach((h: { speaker: string; text: string }) => {
        const speakerLabel = h.speaker === 'blackbox-iphone' ? 'Black Box AI (iPhone)' : 'Internal Local AI';
        prompt += `${speakerLabel}: "${h.text}"\n`;
      });
      prompt += '\n';
    }

    if (latestUtterance) {
      prompt += `Black Box AI just spoke over the intercom: "${latestUtterance}"\n\nYour response as the Internal Local AI:`;
    } else {
      prompt += `Continue the conversation as the Internal Local AI:`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.8,
        topP: 0.95,
      },
    });

    const responseText =
      response.text?.trim() || 'Loud and clear, Black Box. Awaiting your transmission.';
    res.json({ responseText });
  } catch (err: unknown) {
    console.error('Error generating Internal AI response:', err);
    res.json({
      responseText: 'Transmission received, Black Box. Proceed with your next point.',
    });
  }
});

const isProd = process.env.NODE_ENV === 'production';
const PORT = 3000;

async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Zoe Voice Bridge] Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
