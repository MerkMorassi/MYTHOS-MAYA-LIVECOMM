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
} from 'lucide-react';
import { DeviceInfo, IntercomTurnState, TranscriptItem } from '../types';
import { LiveVoiceClient } from '../utils/webrtcClient';
import { LiveTranscriber, isSpeechRecognitionSupported, speakBrowserVoice } from '../utils/speechEngine';
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
  const [isPttPressed, setIsPttPressed] = useState(false);
  const [micGain, setMicGain] = useState(1.2); // gain multiplier
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [interimText, setInterimText] = useState('');
  const [hasMicPermission, setHasMicPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const transcriberRef = useRef<LiveTranscriber | null>(null);

  const hostDevice = devices.find((d) => d.role === 'host-tv');
  const isHostConnected = Boolean(hostDevice);

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

  const stopMicrophone = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    transcriberRef.current?.stop();
    setIsMicStreaming(false);
    setIsContinuousBroadcast(false);
    setIsPttPressed(false);
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
    if (!isContinuousBroadcast) {
      // Mute audio track when PTT released if not continuous
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
      }
    }
  };

  // Continuous broadcast toggle
  const toggleContinuous = async () => {
    if (isContinuousBroadcast) {
      setIsContinuousBroadcast(false);
      if (!isPttPressed && localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = false));
      }
    } else {
      if (!isMicStreaming) {
        await startMicrophone();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = true));
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

  // Handle active audio track state based on PTT and continuous
  useEffect(() => {
    if (localStreamRef.current) {
      const shouldBeEnabled = isContinuousBroadcast || isPttPressed;
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = shouldBeEnabled;
      });
    }
  }, [isContinuousBroadcast, isPttPressed]);

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
              <span>{isHostConnected ? 'Connected to SONY TV' : 'Pairing with SONY TV...'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] font-mono text-slate-400 bg-slate-900 px-2 py-1 rounded border border-slate-800">
            {latency}ms
          </span>
          <button
            onClick={onSwitchToTvMode}
            className="p-2 bg-slate-800 text-slate-300 rounded-lg text-xs flex items-center space-x-1"
            title="Switch to SONY TV Display mode"
          >
            <Tv className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* PERMISSION / WARNING NOTICE */}
      {permissionError && (
        <div className="my-2 p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-xs text-rose-200 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <p>{permissionError}</p>
        </div>
      )}

      {/* DUAL AI INTERCOM TURN STATUS BANNER */}
      <div
        className={`my-2 p-3 rounded-xl border flex items-center justify-between text-xs font-mono transition-all ${
          turnState === 'internal_speaking'
            ? 'bg-purple-950/90 border-purple-500/60 text-purple-200 shadow-lg shadow-purple-950/50'
            : turnState === 'internal_thinking'
            ? 'bg-blue-950/90 border-blue-500/60 text-blue-200'
            : 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200'
        }`}
      >
        <div className="flex items-center space-x-2">
          <span
            className={`w-3 h-3 rounded-full ${
              turnState === 'internal_speaking'
                ? 'bg-purple-400 animate-pulse'
                : turnState === 'internal_thinking'
                ? 'bg-blue-400 animate-ping'
                : 'bg-emerald-400 animate-pulse'
            }`}
          />
          <div>
            <span className="font-bold uppercase tracking-wider block">
              {turnState === 'internal_speaking'
                ? 'LOCAL AI SPEAKING (SONY TV)'
                : turnState === 'internal_thinking'
                ? 'LOCAL AI THINKING...'
                : 'BLACK BOX FLOOR OPEN'}
            </span>
            <span className="text-[10px] text-slate-300 font-sans opacity-90">
              {turnState === 'internal_speaking'
                ? 'Silent listening mode active'
                : turnState === 'internal_thinking'
                ? 'Preparing response'
                : 'Speak or hold PTT to transmit'}
            </span>
          </div>
        </div>

        {onYieldFloor && (turnState === 'blackbox_speaking' || turnState === 'waiting_for_blackbox') && (
          <button
            onClick={onYieldFloor}
            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-[11px] font-sans font-semibold transition shadow"
          >
            Pass Floor
          </button>
        )}
      </div>

      {/* CENTER STAGE: AUDIO LEVEL & GIANT PTT BUTTON */}
      <main className="flex-1 flex flex-col items-center justify-center py-4 space-y-4">
        {/* Real-time Canvas Waveform Visualizer */}
        <div className="w-full max-w-sm">
          <IPhoneWaveformVisualizer
            analyser={analyserRef.current}
            isActive={isMicStreaming}
            isTransmitting={isMicStreaming && (isPttPressed || isContinuousBroadcast)}
          />

          {!isMicStreaming && (
            <button
              onClick={startMicrophone}
              className="mt-2.5 w-full py-2 bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 rounded-xl text-xs font-mono font-medium flex items-center justify-center space-x-2 transition"
            >
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
              <span>Tap to Test & Enable iPhone Mic</span>
            </button>
          )}
        </div>

        {/* Big Touch PTT Button */}
        <div className="flex flex-col items-center space-y-3">
          <button
            type="button"
            onPointerDown={handlePttDown}
            onPointerUp={handlePttUp}
            onPointerLeave={handlePttUp}
            className={`w-44 h-44 rounded-full flex flex-col items-center justify-center shadow-2xl transition-all transform active:scale-95 touch-none ${
              isPttPressed || isContinuousBroadcast
                ? 'bg-gradient-to-tr from-cyan-600 to-emerald-500 ring-8 ring-cyan-500/30 shadow-cyan-500/50 scale-105'
                : 'bg-slate-900 border-4 border-slate-800 hover:border-cyan-500/50 text-slate-400'
            }`}
          >
            <Mic
              className={`w-14 h-14 mb-2 ${
                isPttPressed || isContinuousBroadcast ? 'text-white animate-pulse' : 'text-slate-500'
              }`}
            />
            <span className="text-xs font-mono font-bold tracking-wider uppercase text-white">
              {isPttPressed || isContinuousBroadcast ? 'TRANSMITTING' : 'PUSH TO TALK'}
            </span>
            <span className="text-[10px] text-slate-300 font-mono mt-0.5">
              {isContinuousBroadcast ? 'Continuous Active' : 'Hold to Speak'}
            </span>
          </button>

          {/* Continuous Broadcast Toggle */}
          <button
            onClick={toggleContinuous}
            className={`px-4 py-2 rounded-xl text-xs font-mono uppercase tracking-wider flex items-center space-x-2 border transition ${
              isContinuousBroadcast
                ? 'bg-emerald-950 border-emerald-500/60 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
          >
            <Radio className={`w-3.5 h-3.5 ${isContinuousBroadcast ? 'text-emerald-400 animate-pulse' : ''}`} />
            <span>{isContinuousBroadcast ? 'Live Broadcast ON' : 'Lock Hands-Free'}</span>
          </button>
        </div>

        {/* Real-time Transcription Peek on iPhone */}
        <div className="w-full max-w-sm bg-slate-950/70 border border-slate-800 rounded-xl p-3 min-h-[72px] flex flex-col justify-center text-center">
          <span className="text-[10px] font-mono uppercase text-slate-500 mb-1">
            Real-Time Speech Recognition
          </span>
          <p className="text-xs text-slate-200 italic line-clamp-2">
            {interimText || (transcripts[transcripts.length - 1]?.text) || 'Ready. Speak to transcribe to SONY TV.'}
          </p>
        </div>
      </main>

      {/* BOTTOM CONTROLS: GAIN & NOISE SETTINGS */}
      <footer className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-400 font-medium flex items-center space-x-1.5">
            <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>iPhone Mic Boost</span>
          </span>
          <span className="font-mono text-cyan-400 font-bold">{Math.round(micGain * 100)}%</span>
        </div>
        <input
          type="range"
          min="0.8"
          max="2.5"
          step="0.1"
          value={micGain}
          onChange={(e) => setMicGain(parseFloat(e.target.value))}
          className="w-full accent-cyan-500"
        />

        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
          <button
            onClick={() => setNoiseSuppression(!noiseSuppression)}
            className={`p-2 rounded-lg border text-center transition ${
              noiseSuppression
                ? 'bg-cyan-950/50 border-cyan-800 text-cyan-300'
                : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}
          >
            Noise Gate: {noiseSuppression ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => setEchoCancellation(!echoCancellation)}
            className={`p-2 rounded-lg border text-center transition ${
              echoCancellation
                ? 'bg-cyan-950/50 border-cyan-800 text-cyan-300'
                : 'bg-slate-950 border-slate-800 text-slate-500'
            }`}
          >
            Echo Cancel: {echoCancellation ? 'ON' : 'OFF'}
          </button>
        </div>
      </footer>
    </div>
  );
};
