import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Mic,
  MicOff,
  Radio,
  Volume2,
  Tv,
  Wifi,
  Sparkles,
  Sliders,
  Check,
  AlertCircle,
  VolumeX,
} from 'lucide-react';
import { DeviceInfo, IntercomTurnState, TranscriptItem } from '../types';
import { LiveVoiceClient } from '../utils/webrtcClient';
import { LiveTranscriber, isSpeechRecognitionSupported } from '../utils/speechEngine';
import { IPhoneWaveformVisualizer } from './IPhoneWaveformVisualizer';

interface IPhoneMicViewProps {
  devices: DeviceInfo[];
  latency: number;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  voiceClient: LiveVoiceClient | null;
  transcripts: TranscriptItem[];
  onSwitchToTvMode: () => void;
  turnState?: IntercomTurnState;
  onYieldFloor?: () => void;
}

export const IPhoneMicView: React.FC<IPhoneMicViewProps> = ({
  devices,
  latency,
  connectionStatus,
  voiceClient,
  transcripts,
  onSwitchToTvMode,
  turnState = 'waiting_for_blackbox',
  onYieldFloor,
}) => {
  const [isMicStreaming, setIsMicStreaming] = useState(false);
  const [isContinuousBroadcast, setIsContinuousBroadcast] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [micGain, setMicGain] = useState(1.2);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number>(1);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);

  const hostDevice = devices.find((d) => d.role === 'host-tv');
  const isHostConnected = Boolean(hostDevice);

  // Poll battery
  useEffect(() => {
    if ('getBattery' in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        const updateLevel = () => {
          setBatteryLevel(battery.level);
          voiceClient?.sendBatteryLevel(battery.level);
        };
        updateLevel();
        battery.addEventListener('levelchange', updateLevel);
      });
    }
  }, [voiceClient]);

  // Handle active audio track state based on Mute, PTT and continuous
  useEffect(() => {
    if (localStreamRef.current) {
      const shouldBeEnabled = !isMuted && (isContinuousBroadcast || isPttPressed);
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = shouldBeEnabled;
      });
    }
  }, [isContinuousBroadcast, isPttPressed, isMuted]);

  // Initialize Microphone on iPhone
  const startMicrophone = async () => {
    try {
      setPermissionError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation,
          noiseSuppression,
          autoGainControl: true,
          sampleRate: 48000,
          channelCount: 1,
        },
      });

      localStreamRef.current = stream;
      setHasMicPermission(true);

      // Web Audio setup for gain and visualizer
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = micGain;
      gainNodeRef.current = gainNode;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyserRef.current = analyser;

      source.connect(gainNode);
      gainNode.connect(analyser);

      // Pass stream to WebRTC client for low-latency transmission
      if (voiceClient) {
        await voiceClient.setLocalStream(stream);
      }

      // Start on-device transcription to sync to SONY TV
      if (isSpeechRecognitionSupported()) {
        if (!transcriberRef.current) {
          transcriberRef.current = new LiveTranscriber();
        }
        transcriberRef.current.start(
          (text, isFinal) => {
            if (isFinal) {
              setInterimText('');
              voiceClient?.sendTranscript(text, true);
            } else {
              setInterimText(text);
              voiceClient?.sendTranscript(text, false);
            }
          },
          (err) => console.warn('iPhone Speech Recognition error:', err)
        );
      }

      setIsMicStreaming(true);
    } catch (err: unknown) {
      console.error('Error starting iPhone mic:', err);
      setHasMicPermission(false);
      setPermissionError(
        err instanceof Error ? err.message : 'Please grant microphone permissions in Safari settings.'
      );
    }
  };

  // Push-to-Talk touch handlers
  const handlePttDown = async () => {
    if (!isMicStreaming) {
      await startMicrophone();
    }
    setIsPttPressed(true);
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(40);
      } catch {}
    }
  };

  const handlePttUp = () => {
    setIsPttPressed(false);
  };

  // Continuous broadcast toggle
  const toggleContinuous = async () => {
    if (isContinuousBroadcast) {
      setIsContinuousBroadcast(false);
    } else {
      if (!isMicStreaming) {
        await startMicrophone();
      }
      setIsContinuousBroadcast(true);
    }
  };

  // Update gain when slider moves
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = micGain;
    }
  }, [micGain]);

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-black p-4 select-none">
      {/* MOBILE HEADER */}
      <header className="flex items-center justify-between py-2 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-600/30 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">iPhone Wireless Mic</h1>
            <div className="flex items-center space-x-1.5 text-[11px] font-mono text-cyan-400">
              <span className={`w-2 h-2 rounded-full ${isHostConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
              <span>{isHostConnected ? 'Connected' : 'Pairing...'}</span>
              <span className="ml-2">Battery: {Math.round(batteryLevel * 100)}%</span>
            </div>
          </div>
        </div>
      </header>

      {/* PERMISSION / WARNING NOTICE */}
      {permissionError && (
        <div className="my-2 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p>{permissionError}</p>
        </div>
      )}

      {/* CENTER STAGE */}
      <main className="flex-1 flex flex-col items-center justify-center py-4 space-y-4">
        <div className="w-full max-w-sm">
          <IPhoneWaveformVisualizer
            analyser={analyserRef.current}
            isActive={isMicStreaming}
            isTransmitting={isMicStreaming && !isMuted && (isPttPressed || isContinuousBroadcast)}
          />
        </div>

        {/* Big Touch PTT Button */}
        <div className="flex flex-col items-center space-y-3">
          <button
            type="button"
            onPointerDown={handlePttDown}
            onPointerUp={handlePttUp}
            onPointerLeave={handlePttUp}
            className={`w-44 h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all transform active:scale-95 touch-none ${
              isMuted ? 'bg-rose-950 border-4 border-rose-800 text-rose-400' :
              isPttPressed || isContinuousBroadcast
                ? 'bg-gradient-to-tr from-cyan-600 to-emerald-500 ring-8 ring-cyan-500/30 shadow-cyan-500/50 scale-105'
                : 'bg-slate-900 border-4 border-slate-800 hover:border-cyan-500/50 text-slate-400'
            }`}
          >
            <Mic
              className={`w-14 h-14 mb-2 ${
                isMuted ? 'text-rose-500' :
                isPttPressed || isContinuousBroadcast ? 'text-white animate-pulse' : 'text-slate-500'
              }`}
            />
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-white">
              {isMuted ? 'MUTED' : (isPttPressed || isContinuousBroadcast ? 'TRANSMITTING' : 'PUSH TO TALK')}
            </span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className={`px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider flex items-center space-x-2 border transition ${
                isMuted
                  ? 'bg-rose-950 border-rose-500/60 text-rose-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <VolumeX className="w-3.5 h-3.5" />
              <span>{isMuted ? 'Unmute' : 'Mute'}</span>
            </button>
            <button
              onClick={toggleContinuous}
              className={`px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider flex items-center space-x-2 border transition ${
                isContinuousBroadcast
                  ? 'bg-emerald-950 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{isContinuousBroadcast ? 'Broadcast ON' : 'Lock'}</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
};
