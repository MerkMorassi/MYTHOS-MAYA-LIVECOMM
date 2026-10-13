export type DeviceRole = 'host-tv' | 'iphone-mic' | 'viewer';

export interface DeviceInfo {
  id: string;
  role: DeviceRole;
  deviceName: string;
  connectedAt: number;
}

export interface TranscriptItem {
  id: string;
  senderId: string;
  senderName: string;
  role: DeviceRole;
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

export interface VoiceSettings {
  voiceURI: string;
  rate: number;
  pitch: number;
  volume: number;
  autoSpeakIncoming: boolean;
}

export type IntercomTurnState =
  | 'idle'
  | 'blackbox_speaking'
  | 'internal_thinking'
  | 'internal_speaking'
  | 'waiting_for_blackbox';

export interface IntercomMessage {
  id: string;
  speaker: 'blackbox-iphone' | 'internal-ai';
  text: string;
  timestamp: number;
}

export interface IntercomConfig {
  autoTurnEnabled: boolean;
  silenceThresholdMs: number;
  intercomChirpEnabled: boolean;
  personaPrompt: string;
}

