import React from 'react';
import { Tv, Mic, Smartphone, CheckCircle, Volume2, X, Sliders } from 'lucide-react';
import { playSpeakerTestChime } from '../utils/audioDevices';

interface WindowsSetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOutputId?: string;
}

export const WindowsSetupGuideModal: React.FC<WindowsSetupGuideModalProps> = ({
  isOpen,
  onClose,
  selectedOutputId,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl text-slate-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl border border-amber-500/30">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Audio Pipeline Configuration</h2>
            <p className="text-xs text-slate-400">Windows MIC • SONY TV HDMI Speakers • iPhone Link</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Step 1: SONY TV Output */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm font-semibold text-white">
                <Tv className="w-4 h-4 text-cyan-400" />
                <span>1. SONY TV Monitor & Audio Speakers</span>
              </div>
              <button
                onClick={() => playSpeakerTestChime(selectedOutputId)}
                className="px-2.5 py-1 bg-cyan-600/30 hover:bg-cyan-600 text-cyan-300 hover:text-white rounded text-xs flex items-center space-x-1 border border-cyan-500/30 transition"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Test SONY Chime</span>
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              When Windows is connected to your SONY TV via HDMI, Windows treats the SONY TV as an audio endpoint (e.g. <em>SONY TV (NVIDIA High Definition Audio)</em>).
            </p>
            <div className="flex items-start space-x-2 text-[11px] text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                <strong>Windows Tip:</strong> Click the speaker icon in your Windows taskbar and choose <em>"SONY TV"</em> as the active playback device, or select it directly from this app’s Audio Device selector.
              </span>
            </div>
          </div>

          {/* Step 2: Windows MIC */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-sm font-semibold text-white">
              <Mic className="w-4 h-4 text-purple-400" />
              <span>2. Windows Setting for MIC Input</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              This application captures your local Windows microphone for two-way intercom and speech-to-text transcription alongside the iPhone remote audio.
            </p>
            <div className="flex items-start space-x-2 text-[11px] text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
              <span>
                In Windows Settings → Sound → Input, verify your default microphone is selected and volume level is set to at least 80%.
              </span>
            </div>
          </div>

          {/* Step 3: iPhone Wireless Interface */}
          <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-sm font-semibold text-white">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span>3. iPhone Low-Latency Wireless Audio Link</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              The iPhone streams low-latency Opus audio directly across the wireless interface to this SONY TV workstation:
            </p>
            <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
              <li>Scan the pairing QR Code with your iPhone camera to launch.</li>
              <li>Press and hold <strong>PUSH TO TALK</strong> or switch on <strong>LIVE BROADCAST</strong>.</li>
              <li>iPhone audio immediately routes through the SONY TV speakers with live decibel VU meters and real-time transcription.</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition"
          >
            Got it, continue
          </button>
        </div>
      </div>
    </div>
  );
};
