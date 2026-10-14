import React, { useState, useEffect, useRef } from 'react';
import {
  Tv,
  Mic,
  MicOff,
  Smartphone,
  Volume2,
  VolumeX,
  Radio,
  Sliders,
  Send,
  Download,
  Trash2,
  QrCode,
  HelpCircle,
  Settings,
  Sparkles,
  Wifi,
  WifiOff,
  Check,
  Copy,
  ChevronDown,
  Layers,
  Battery,
} from 'lucide-react';
import { AudioDeviceOption, DeviceInfo, TranscriptItem, VoiceSettings } from '../types';
import { AudioVisualizer } from './AudioVisualizer';
import { LatencySparkline } from './LatencySparkline';
import { IntercomStation } from './IntercomStation';
import { playSpeakerTestChime, isSetSinkIdSupported } from '../utils/audioDevices';
import { speakBrowserVoice, stopBrowserVoice, LiveTranscriber, isSpeechRecognitionSupported } from '../utils/speechEngine';
import { LiveVoiceClient } from '../utils/webrtcClient';
import { IntercomConfig, IntercomMessage, IntercomTurnState } from '../types';

interface SonyTvHostViewProps {
  devices: DeviceInfo[];
  latency: number;
  connectionStatus: 'disconnected' | 'connecting' | 'connected';
  voiceClient: LiveVoiceClient | null;
  transcripts: TranscriptItem[];
  onClearTranscripts: () => void;
  voiceSettings: VoiceSettings;
  onOpenVoiceSettings: () => void;
  onOpenQRCode: () => void;
  onOpenSetupGuide: () => void;
  audioInputs: AudioDeviceOption[];
  audioOutputs: AudioDeviceOption[];
  selectedInputId: string;
  selectedOutputId: string;
  onSelectInputId: (id: string) => void;
  onSelectOutputId: (id: string) => void;
  turnState: IntercomTurnState;
  activeSpeakerText: string;
  intercomMessages: IntercomMessage[];
  intercomConfig: IntercomConfig;
  onConfigChange: (config: IntercomConfig) => void;
  onTriggerInternalAi: () => void;
  onReleaseTurnToBlackBox: () => void;
  onClearIntercomHistory: () => void;
  isSpeaking: boolean;
  latencyHistory: number[];
  iphoneBattery: number;
}

const QUICK_PHRASES = [
  'Loud and clear',
  'Audio check 1, 2, 3',
  'Stand by, receiving signal',
  'Confirmed, audio verified',
  'Please repeat that',
  'System operational',
];

export const SonyTvHostView: React.FC<SonyTvHostViewProps> = ({
  devices,
  latency,
  connectionStatus,
  voiceClient,
  transcripts,
  onClearTranscripts,
  voiceSettings,
  onOpenVoiceSettings,
  onOpenQRCode,
  onOpenSetupGuide,
  audioInputs,
  audioOutputs,
  selectedInputId,
  selectedOutputId,
  onSelectInputId,
  onSelectOutputId,
  turnState,
  activeSpeakerText,
  intercomMessages,
  intercomConfig,
  onConfigChange,
  onTriggerInternalAi,
  onReleaseTurnToBlackBox,
  onClearIntercomHistory,
  isSpeaking,
  latencyHistory,
  iphoneBattery,
}) => {
  // Local Windows Mic state
  const [isLocalMicActive, setIsLocalMicActive] = useState(false);
  const [localMicStream, setLocalMicStream] = useState<MediaStream | null>(null);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Live Transcriber for local Windows mic
  const transcriberRef = useRef<LiveTranscriber | null>(null);
  const [interimText, setInterimText] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState<boolean>(true);

  // Browser Voice Speech state
  const [speechInputText, setSpeechInputText] = useState('');
  // isSpeaking is passed as prop

  // Remote iPhone presence
  const iphoneDevice = devices.find((d) => d.role === 'iphone-mic');
  const isIphoneConnected = Boolean(iphoneDevice);

  // Remote audio element for WebRTC incoming iPhone audio
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  // Auto-scroll transcript container
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Initialize AudioContext & local Windows Mic if user activates it
  const toggleLocalMic = async () => {
    if (isLocalMicActive) {
      if (localMicStream) {
        localMicStream.getTracks().forEach((t) => t.stop());
        setLocalMicStream(null);
      }
      transcriberRef.current?.stop();
      setIsLocalMicActive(false);
    } else {
      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            deviceId: selectedInputId ? { exact: selectedInputId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        setLocalMicStream(stream);
        setIsLocalMicActive(true);

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioCtx();
        }
        const ctx = audioContextRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const source = ctx.createMediaStreamSource(stream);
        const node = ctx.createAnalyser();
        node.fftSize = 256;
        source.connect(node);
        setAnalyser(node);

        // Start local transcription
        if (isSpeechRecognitionSupported() && isTranscribing) {
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
              }
            },
            (err) => console.warn('Local recognition error:', err)
          );
        }
      } catch (err) {
        console.error('Failed to capture Windows microphone:', err);
      }
    }
  };

  // Configure output sinkId on remoteAudio element when selectedOutputId changes
  useEffect(() => {
    if (remoteAudioRef.current && selectedOutputId && isSetSinkIdSupported()) {
      try {
        (remoteAudioRef.current as unknown as { setSinkId: (id: string) => Promise<void> })
          .setSinkId(selectedOutputId)
          .catch((err) => console.warn('Error setting sinkId on audio element:', err));
      } catch (e) {
        console.warn('sinkId error:', e);
      }
    }
  }, [selectedOutputId]);

  // Auto-scroll transcripts when new items arrive
  useEffect(() => {
    if (autoScroll && transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcripts, interimText, autoScroll]);

  // Handle instant TTS speech dispatch
  const handleSpeakText = (textToSpeak: string) => {
    if (!textToSpeak.trim()) return;
    // isSpeaking is controlled by parent prop
    speakBrowserVoice(textToSpeak, voiceSettings, () => {
      // isSpeaking is controlled by parent prop
    });
    // Broadcast to peer devices so iPhone also sees it
    voiceClient?.sendIntercomTTS(textToSpeak);
    setSpeechInputText('');
  };

  // Export transcript session to a plain text file (.txt)
  const handleExportTranscript = () => {
    if (transcripts.length === 0) return;

    const sessionDate = new Date();
    const header = [
      '================================================================',
      'ZOE FILMS - LIVE VOICE TRANSCRIPTION SESSION',
      `Session Date: ${sessionDate.toLocaleDateString()} ${sessionDate.toLocaleTimeString()}`,
      `Total Entries: ${transcripts.length}`,
      'Audio Hardware: SONY TV HDMI Audio • Windows MIC • iPhone Wireless Source',
      'Synthesis Engine: Default Browser Voice (Native Web Speech)',
      '================================================================\n',
    ].join('\n');

    const body = transcripts
      .map((t, idx) => {
        const time = new Date(t.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        const isIphone = t.role === 'iphone-mic' || t.senderName.toLowerCase().includes('iphone');
        const speaker = isIphone ? 'iPhone Wireless Mic' : 'Windows Mic Host';
        return `[#${idx + 1}] [${time}] [${speaker}]:\n  ${t.text}\n`;
      })
      .join('\n');

    const fullContent = `${header}\n${body}\n================================================================\nEND OF TRANSCRIPTION SESSION\n`;
    const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zoe-transcript-session-${sessionDate.toISOString().slice(0, 10)}_${sessionDate.getHours()}-${sessionDate.getMinutes()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export intercom history to a JSON file (.json)
  const handleExportJson = () => {
    if (intercomMessages.length === 0) return;

    const blob = new Blob([JSON.stringify(intercomMessages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `zoe-intercom-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const copyTranscriptText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* Hidden audio element for WebRTC iPhone stream */}
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      {/* TOP BROADCAST STATUS HEADER (10-Foot UI for SONY TV) */}
      <header className="border-b border-slate-800 bg-[#0c121e] px-6 py-4 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-950/60 border border-cyan-400/30">
              <Tv className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-xl font-bold tracking-tight text-white">ZOE FILMS</h1>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-950 border border-cyan-500/40 text-cyan-300 font-semibold">
                  LIVE VOICE WORKSTATION
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">
                SONY TV MONITOR & SPEAKERS • WINDOWS MIC INPUT • IPHONE WIRELESS SOURCE
              </p>
            </div>
          </div>

          {/* Quick Hardware Controls & Status */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* iPhone Connection Badge */}
            <div
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-mono transition ${
                isIphoneConnected
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                  : 'bg-slate-900 border-slate-800 text-slate-400'
              }`}
            >
              <Smartphone className="w-4 h-4 text-cyan-400" />
              <div className="flex flex-col">
                <span className="font-semibold leading-tight">
                  {isIphoneConnected ? 'iPhone Wireless Linked' : 'iPhone Awaiting Link'}
                </span>
                <span className="text-[10px] text-slate-400">
                  {isIphoneConnected ? `${latency}ms Low Latency` : 'Scan QR code to connect'}
                </span>
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isIphoneConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {isIphoneConnected && (
                <div className="flex items-center space-x-1 text-slate-300">
                  <Battery className="w-3 h-3" />
                  <span>{Math.round(iphoneBattery * 100)}%</span>
                </div>
              )}
            </div>

            <button
              onClick={() => onConfigChange({...intercomConfig, autoTurnEnabled: !intercomConfig.autoTurnEnabled})}
              className={`px-3 py-2 rounded-lg text-xs font-medium flex items-center space-x-1.5 transition ${
                intercomConfig.autoTurnEnabled ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {intercomConfig.autoTurnEnabled ? 'Pause Conversation' : 'Resume Conversation'}
            </button>

            {/* QR Code Button */}
            <button
              onClick={onOpenQRCode}
              className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 shadow-md shadow-cyan-950/40 transition"
              title="Show QR Code for iPhone"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Connect iPhone</span>
            </button>

            {/* Setup Guide */}
            <button
              onClick={onOpenSetupGuide}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
              title="Windows MIC & SONY TV Setup Guide"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Voice Settings */}
            <button
              onClick={onOpenVoiceSettings}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
              title="Browser Voice Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* HARDWARE DEVICE & AUDIO ROUTING BAR */}
      <section className="bg-slate-950/70 border-b border-slate-800/80 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* SONY TV Speakers Routing */}
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1">
              <Tv className="w-3.5 h-3.5 text-cyan-400" />
              <span>Speaker Output:</span>
            </span>
            <select
              value={selectedOutputId}
              onChange={(e) => onSelectOutputId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="">SONY TV (Windows Default Speakers)</option>
              {audioOutputs.map((out) => (
                <option key={out.deviceId} value={out.deviceId}>
                  {out.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => playSpeakerTestChime(selectedOutputId)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-[11px] flex items-center space-x-1 border border-slate-700 transition"
              title="Test chime through SONY TV speakers"
            >
              <Volume2 className="w-3 h-3 text-cyan-400" />
              <span>Test Chime</span>
            </button>
          </div>

          {/* Windows MIC Input */}
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-mono text-[11px] uppercase tracking-wider flex items-center space-x-1">
              <Mic className="w-3.5 h-3.5 text-purple-400" />
              <span>Windows MIC:</span>
            </span>
            <select
              value={selectedInputId}
              onChange={(e) => onSelectInputId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-purple-500"
            >
              <option value="">Windows Default Microphone</option>
              {audioInputs.map((inp) => (
                <option key={inp.deviceId} value={inp.deviceId}>
                  {inp.label}
                </option>
              ))}
            </select>
            <button
              onClick={toggleLocalMic}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold flex items-center space-x-1 transition ${
                isLocalMicActive
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
              }`}
            >
              {isLocalMicActive ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
              <span>{isLocalMicActive ? 'Mic Active' : 'Start Mic'}</span>
            </button>
          </div>

          {/* Browser Voice Status */}
          <div className="flex items-center space-x-2 text-[11px] font-mono text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Browser Voice: Native Web Speech Engine Active</span>
          </div>
        </div>
      </section>

      {/* MAIN TWO-COLUMN STUDIO STAGE */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT / CENTER: REAL-TIME TRANSCRIPTION FEED (7 COLS) */}
        <div className="lg:col-span-7 flex flex-col bg-[#0b101c] border border-slate-800/90 rounded-2xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-5 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
              <h2 className="text-sm font-semibold tracking-wide text-white uppercase font-mono">
                Seamless Real-Time Transcription
              </h2>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-mono">
                {transcripts.length} entries
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setAutoScroll(!autoScroll)}
                className={`px-2.5 py-1 text-[11px] rounded transition font-mono ${
                  autoScroll ? 'text-cyan-400 bg-cyan-950/40 border border-cyan-800/40' : 'text-slate-400 bg-slate-900 border border-slate-800'
                }`}
                title="Toggle Auto-Scroll"
              >
                Auto-Scroll: {autoScroll ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={handleExportTranscript}
                disabled={transcripts.length === 0}
                className="px-2.5 py-1 bg-cyan-950/70 hover:bg-cyan-900/90 text-cyan-300 hover:text-white border border-cyan-700/50 rounded text-[11px] font-mono flex items-center space-x-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-sm"
                title="Download current transcript session as plain text (.txt)"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                <span className="font-semibold">.txt</span>
              </button>
              <button
                onClick={handleExportJson}
                disabled={intercomMessages.length === 0}
                className="px-2.5 py-1 bg-purple-950/70 hover:bg-purple-900/90 text-purple-300 hover:text-white border border-purple-700/50 rounded text-[11px] font-mono flex items-center space-x-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition shadow-sm"
                title="Download intercom history as JSON (.json)"
              >
                <Layers className="w-3.5 h-3.5 text-purple-400" />
                <span className="font-semibold">.json</span>
              </button>
              <button
                onClick={onClearTranscripts}
                disabled={transcripts.length === 0}
                className="p-1.5 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 disabled:opacity-30 transition border border-transparent hover:border-slate-700"
                title="Clear Transcript"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Transcript Scroll Area */}
          <div className="flex-1 p-5 overflow-y-auto min-h-[380px] max-h-[520px] space-y-3.5 font-sans">
            {transcripts.length === 0 && !interimText ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                <Radio className="w-10 h-10 mb-3 text-slate-700 stroke-[1.5]" />
                <p className="text-sm font-medium text-slate-400">Waiting for voice input...</p>
                <p className="text-xs text-slate-600 max-w-sm mt-1 leading-relaxed">
                  Speak into your iPhone wireless microphone or activate your Windows MIC to begin real-time seamless transcription.
                </p>
                {!isIphoneConnected && (
                  <button
                    onClick={onOpenQRCode}
                    className="mt-4 px-3 py-1.5 bg-cyan-950 border border-cyan-700/50 hover:bg-cyan-900/60 text-cyan-300 rounded-lg text-xs font-mono transition"
                  >
                    Open iPhone QR Pairing Code
                  </button>
                )}
              </div>
            ) : (
              <>
                {transcripts.map((t) => {
                  const isIphone = t.role === 'iphone-mic' || t.senderName.toLowerCase().includes('iphone');
                  return (
                    <div
                      key={t.id}
                      className={`group relative p-3.5 rounded-xl bg-slate-900/60 border ${
                        isIphone ? 'border-cyan-800/80' : 'border-purple-800/80'
                      } hover:border-slate-600 transition`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center space-x-2">
                          <span
                            className={`flex items-center space-x-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                              isIphone
                                ? 'bg-cyan-950 text-cyan-300 border border-cyan-800/50'
                                : 'bg-purple-950 text-purple-300 border border-purple-800/50'
                            }`}
                          >
                            {isIphone ? (
                                <>
                                    <Smartphone className="w-3 h-3" />
                                    <span>iPhone Wireless Mic</span>
                                </>
                            ) : (
                                <>
                                    <Mic className="w-3 h-3" />
                                    <span>Windows Mic Host</span>
                                </>
                            )}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>

                        <button
                          onClick={() => copyTranscriptText(t.text, t.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white rounded transition"
                          title="Copy text"
                        >
                          {copiedId === t.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Large readable text for SONY TV */}
                      <p className="text-base sm:text-lg font-normal text-slate-100 tracking-wide leading-relaxed">
                        {t.text}
                      </p>
                    </div>
                  );
                })}

                {/* Live Interim In-Flight Speech */}
                {interimText && (
                  <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/40 animate-pulse">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded uppercase bg-cyan-900 text-cyan-200">
                        Live Speaking...
                      </span>
                    </div>
                    <p className="text-base sm:text-lg font-normal text-cyan-300 italic tracking-wide">
                      {interimText}
                    </p>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </>
            )}
          </div>
        </div>

        {/* RIGHT: AUDIO VISUALIZER & BROWSER VOICE COMMAND DECK (5 COLS) */}
        <div className="lg:col-span-5 flex flex-col space-y-6">
          {/* Audio Visualizer Card */}
          <div className="bg-[#0b101c] border border-slate-800/90 rounded-2xl p-4 shadow-2xl flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
                  Audio Spectrum & VU Monitor
                </h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                SONY TV SPEAKERS
              </span>
            </div>

            <AudioVisualizer
              analyser={analyser}
              isActive={isLocalMicActive || isIphoneConnected || isSpeaking}
              theme="tv-cinematic"
              label={isIphoneConnected ? 'IPHONE + SONY TV HDMI STEREO' : 'WINDOWS AUDIO CHAIN'}
            />

            {/* Quick telemetry */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-500 block text-[9px] uppercase">Latency</span>
                  <LatencySparkline data={latencyHistory} />
                </div>
                <span className="text-cyan-400 font-bold">{latency} ms</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                <span className="text-slate-500 block text-[9px] uppercase">Audio Sink</span>
                <span className="text-slate-300 truncate font-semibold">SONY TV</span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/60">
                <span className="text-slate-500 block text-[9px] uppercase">Default Voice</span>
                <span className="text-emerald-400 font-semibold">Browser Voice</span>
              </div>
            </div>
          </div>

          {/* DUAL AI INTERCOM TURN-TAKING STATION */}
          <IntercomStation
            turnState={turnState}
            activeSpeakerText={activeSpeakerText}
            intercomMessages={intercomMessages}
            intercomConfig={intercomConfig}
            onConfigChange={onConfigChange}
            onTriggerInternalAi={onTriggerInternalAi}
            onReleaseTurnToBlackBox={onReleaseTurnToBlackBox}
            onClearHistory={onClearIntercomHistory}
            isIphoneConnected={isIphoneConnected}
          />

          {/* BROWSER VOICE & INTERCOM COMMAND DECK */}
          <div className="bg-[#0b101c] border border-slate-800/90 rounded-2xl p-5 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                  Browser Voice Seamless Intercom
                </h3>
              </div>
              <button
                onClick={onOpenVoiceSettings}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono flex items-center space-x-1"
              >
                <Sliders className="w-3 h-3" />
                <span>Configure Voice</span>
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Transmit speech aloud through the SONY TV speakers and wirelessly back to the connected iPhone using the system Browser Voice.
            </p>

            {/* Quick Canned Broadcast Buttons */}
            <div>
              <span className="block text-[10px] font-mono uppercase text-slate-400 mb-2">
                Instant Presets (1-Click to Speak)
              </span>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_PHRASES.map((phrase) => (
                  <button
                    key={phrase}
                    onClick={() => handleSpeakText(phrase)}
                    className="p-2 text-left bg-slate-900/80 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/40 rounded-xl text-xs text-slate-200 transition truncate shadow"
                  >
                    "{phrase}"
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Text-to-Speech Input */}
            <div className="space-y-2">
              <span className="block text-[10px] font-mono uppercase text-slate-400">
                Custom Speech Broadcast
              </span>
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={speechInputText}
                  onChange={(e) => setSpeechInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSpeakText(speechInputText);
                  }}
                  placeholder="Type message to speak via Browser Voice..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
                <button
                  onClick={() => handleSpeakText(speechInputText)}
                  disabled={!speechInputText.trim() || isSpeaking}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition shadow-lg shadow-emerald-950/40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Speak</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
