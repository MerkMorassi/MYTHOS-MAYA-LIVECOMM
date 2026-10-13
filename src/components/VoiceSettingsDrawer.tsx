import React from 'react';
import { Volume2, VolumeX, X, Play, Sliders } from 'lucide-react';
import { VoiceSettings } from '../types';
import { VoiceOption, speakBrowserVoice, stopBrowserVoice } from '../utils/speechEngine';

interface VoiceSettingsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  settings: VoiceSettings;
  onSettingsChange: (newSettings: VoiceSettings) => void;
  voices: VoiceOption[];
}

export const VoiceSettingsDrawer: React.FC<VoiceSettingsDrawerProps> = ({
  isOpen,
  onClose,
  settings,
  onSettingsChange,
  voices,
}) => {
  if (!isOpen) return null;

  const handleTestVoice = () => {
    speakBrowserVoice('Browser Voice communication active. Output verified on SONY TV speakers.', settings);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl text-slate-100">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/30">
            <Volume2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Browser Voice Settings</h2>
            <p className="text-xs text-slate-400">Default Web Speech Synthesis Configuration</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Voice Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
              Selected Browser Voice
            </label>
            <select
              value={settings.voiceURI}
              onChange={(e) => onSettingsChange({ ...settings, voiceURI: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
            >
              <option value="">Default Browser Voice (System Default)</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} {v.isDefault ? '• (System Default)' : ''} ({v.lang})
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Currently utilizing the native browser synthesizer for zero latency speech output.
            </p>
          </div>

          {/* Rate / Speed */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-slate-300 font-medium">Speech Rate</span>
              <span className="font-mono text-cyan-400">{settings.rate.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="2.0"
              step="0.1"
              value={settings.rate}
              onChange={(e) => onSettingsChange({ ...settings, rate: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          {/* Pitch */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-slate-300 font-medium">Pitch</span>
              <span className="font-mono text-cyan-400">{settings.pitch.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.1"
              value={settings.pitch}
              onChange={(e) => onSettingsChange({ ...settings, pitch: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          {/* Volume */}
          <div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-slate-300 font-medium">Output Volume</span>
              <span className="font-mono text-cyan-400">{Math.round(settings.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1.0"
              step="0.05"
              value={settings.volume}
              onChange={(e) => onSettingsChange({ ...settings, volume: parseFloat(e.target.value) })}
              className="w-full accent-cyan-500"
            />
          </div>

          {/* Auto-Speak incoming iPhone transcripts toggle */}
          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 cursor-pointer">
              <div className="space-y-0.5 pr-2">
                <span className="text-xs font-semibold text-white block">Auto-Read Incoming iPhone Speech</span>
                <span className="text-[11px] text-slate-400 block">
                  Automatically read iPhone transcripts through SONY TV speakers via Browser Voice
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.autoSpeakIncoming}
                onChange={(e) => onSettingsChange({ ...settings, autoSpeakIncoming: e.target.checked })}
                className="w-4 h-4 accent-emerald-500 rounded cursor-pointer shrink-0"
              />
            </label>
          </div>

          {/* Test Buttons */}
          <div className="pt-2 flex items-center space-x-2">
            <button
              onClick={handleTestVoice}
              className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition shadow-lg shadow-emerald-950/40"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Test Browser Voice</span>
            </button>
            <button
              onClick={stopBrowserVoice}
              className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs flex items-center space-x-1 transition"
              title="Stop Speech"
            >
              <VolumeX className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
