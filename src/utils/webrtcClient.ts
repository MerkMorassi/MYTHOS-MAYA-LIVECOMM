import { DeviceInfo, DeviceRole, IntercomTurnState, TranscriptItem } from '../types';

export interface WebRTCClientOptions {
  role: DeviceRole;
  deviceName: string;
  onStatusChange?: (status: 'disconnected' | 'connecting' | 'connected') => void;
  onDevicesUpdate?: (devices: DeviceInfo[]) => void;
  onTranscript?: (transcript: TranscriptItem) => void;
  onIntercomTTS?: (data: { text: string; senderName: string; voice?: string }) => void;
  onTurnState?: (turnState: IntercomTurnState, speaker?: string, activeText?: string) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onLatencyUpdate?: (ms: number) => void;
  onBatteryUpdate?: (level: number) => void;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export class LiveVoiceClient {
  private ws: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private clientId = '';
  private options: WebRTCClientOptions;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isDestroyed = false;

  constructor(options: WebRTCClientOptions) {
    this.options = options;
  }

  public connect(): void {
    if (this.isDestroyed) return;

    this.options.onStatusChange?.('connecting');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.options.onStatusChange?.('connected');
        this.startPing();

        // Register role and device name
        this.send({
          type: 'register',
          role: this.options.role,
          deviceName: this.options.deviceName,
        });

        // Initialize WebRTC
        this.initPeerConnection();
      };

      this.ws.onmessage = async (evt) => {
        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === 'init') {
            this.clientId = msg.clientId;
            if (msg.connectedDevices) {
              this.options.onDevicesUpdate?.(msg.connectedDevices);
            }
          } else if (msg.type === 'device-list-update') {
            if (msg.connectedDevices) {
              this.options.onDevicesUpdate?.(msg.connectedDevices);
            }
            // If we are the iPhone and TV host just joined, initiate WebRTC offer
            if (this.options.role === 'iphone-mic' && msg.joined?.role === 'host-tv') {
              this.createAndSendOffer();
            }
          } else if (msg.type === 'webrtc-signal') {
            await this.handleWebRTCSignal(msg.data);
          } else if (msg.type === 'transcript') {
            this.options.onTranscript?.({
              id: msg.id,
              senderId: msg.senderId,
              senderName: msg.senderName,
              role: msg.role,
              text: msg.text,
              timestamp: msg.timestamp,
              isFinal: msg.isFinal,
            });
          } else if (msg.type === 'intercom-tts') {
            this.options.onIntercomTTS?.({
              text: msg.text,
              senderName: msg.senderName,
              voice: msg.voice,
            });
          } else if (msg.type === 'turn-state') {
            this.options.onTurnState?.(msg.turnState, msg.speaker, msg.activeText);
          } else if (msg.type === 'pong') {
            const rtt = Date.now() - msg.timestamp;
            this.options.onLatencyUpdate?.(Math.max(1, rtt));
          } else if (msg.type === 'battery-update') {
            this.options.onBatteryUpdate?.(msg.level);
          }
        } catch (e) {
          console.error('Error handling WS message:', e);
        }
      };

      this.ws.onclose = () => {
        this.options.onStatusChange?.('disconnected');
        this.cleanupPing();
        if (!this.isDestroyed) {
          this.reconnectTimeout = setTimeout(() => this.connect(), 2000);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('WebSocket connection error:', err);
      };
    } catch (e) {
      console.error('WebSocket creation failed:', e);
      this.options.onStatusChange?.('disconnected');
    }
  }

  private initPeerConnection(): void {
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
    }

    try {
      this.peerConnection = new RTCPeerConnection(RTC_CONFIG);

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          this.send({
            type: 'webrtc-signal',
            data: { candidate: event.candidate },
          });
        }
      };

      this.peerConnection.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          this.options.onRemoteStream?.(event.streams[0]);
        }
      };

      // If we already have local stream tracks, add them to peer connection
      if (this.localStream) {
        this.localStream.getTracks().forEach((track) => {
          this.peerConnection?.addTrack(track, this.localStream!);
        });
      }

      // If we are the iPhone and we are connected, create offer to start stream
      if (this.options.role === 'iphone-mic') {
        this.createAndSendOffer();
      }
    } catch (err) {
      console.error('Failed to init RTCPeerConnection:', err);
    }
  }

  public async setLocalStream(stream: MediaStream): Promise<void> {
    this.localStream = stream;
    if (this.peerConnection) {
      // Remove any existing tracks first
      const senders = this.peerConnection.getSenders();
      for (const sender of senders) {
        if (sender.track) {
          this.peerConnection.removeTrack(sender);
        }
      }
      stream.getTracks().forEach((track) => {
        this.peerConnection?.addTrack(track, stream);
      });

      if (this.options.role === 'iphone-mic') {
        await this.createAndSendOffer();
      }
    }
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.peerConnection) return;
    try {
      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
      });
      await this.peerConnection.setLocalDescription(offer);
      this.send({
        type: 'webrtc-signal',
        data: { description: this.peerConnection.localDescription },
      });
    } catch (err) {
      console.warn('Error creating WebRTC offer:', err);
    }
  }

  private async handleWebRTCSignal(data: {
    description?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }): Promise<void> {
    if (!this.peerConnection) return;

    try {
      if (data.description) {
        const desc = new RTCSessionDescription(data.description);
        await this.peerConnection.setRemoteDescription(desc);

        if (desc.type === 'offer') {
          const answer = await this.peerConnection.createAnswer();
          await this.peerConnection.setLocalDescription(answer);
          this.send({
            type: 'webrtc-signal',
            data: { description: this.peerConnection.localDescription },
          });
        }
      } else if (data.candidate) {
        const candidate = new RTCIceCandidate(data.candidate);
        await this.peerConnection.addIceCandidate(candidate);
      }
    } catch (err) {
      console.warn('WebRTC signal handling error:', err);
    }
  }

  public sendTranscript(text: string, isFinal: boolean, id?: string): void {
    this.send({
      type: 'transcript',
      id: id || ('t_' + Date.now()),
      text,
      isFinal,
      timestamp: Date.now(),
    });
  }

  public sendIntercomTTS(text: string, voice?: string): void {
    this.send({
      type: 'intercom-tts',
      text,
      voice,
    });
  }

  public sendTurnState(turnState: IntercomTurnState, speaker?: string, activeText?: string): void {
    this.send({
      type: 'turn-state',
      turnState,
      speaker,
      activeText,
    });
  }

  public sendBatteryLevel(level: number): void {
    this.send({
      type: 'battery-update',
      level,
    });
  }

  private send(data: object): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private startPing(): void {
    this.cleanupPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      }
    }, 2500);
  }

  private cleanupPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public destroy(): void {
    this.isDestroyed = true;
    this.cleanupPing();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
