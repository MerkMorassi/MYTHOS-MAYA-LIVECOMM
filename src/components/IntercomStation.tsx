import React, { useState } from 'react';
import {
  Radio,
  Sparkles,
  Smartphone,
  Cpu,
  Volume2,
  VolumeX,
  ArrowRightLeft,
  Sliders,
  Check,
  Send,
  RotateCcw,
  Bot,
  Layers,
} from 'lucide-react';
import { IntercomConfig, IntercomMessage, IntercomTurnState } from '../types';

interface IntercomStationProps {
  turnState: IntercomTurnState;
  activeSpeakerText: string;
  intercomMessages: IntercomMessage[];
  intercomConfig: IntercomConfig;
  onConfigChange: (config: IntercomConfig) => void;
  onTriggerInternalAi: () => void;
  onReleaseTurnToBlackBox: () => void;
  onClearHistory: () => void;
  isIphoneConnected: boolean;
}

export const IntercomStation: React.FC<IntercomStationProps> = ({
  turnState,
  activeSpeakerText,
  intercomMessages,
  intercomConfig,
  onConfigChange,
  onTriggerInternalAi,
  onReleaseTurnToBlackBox,
  onClearHistory,
  isIphoneConnected,
}) => {
  const [showConfig, setShowConfig] = useState(false);

  // Status badge logic
  const getStatusBadge = () => {
    switch (turnState) {
      case 'blackbox_speaking':
        return {
          label: 'BLACK BOX AI (IPHONE) TRANSMITTING',
          sub: 'Local Internal AI is Silently Listening',
          bg: 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300',
          dot: 'bg-emerald-400 animate-pulse',
        };
      case 'internal_thinking':
        return {
          label: 'LOCAL INTERNAL AI EVALUATING...',
          sub: 'Synthesizing response via Gemini 3.8 Flash',
          bg: 'bg-blue-950/80 border-blue-500/50 text-blue-300',
          dot: 'bg-blue-400 animate-ping',
        };
      case 'internal_speaking':
        return {
          label: 'LOCAL INTERNAL AI ON AIR',
          sub: 'Speaking via Browser Voice to SONY TV Speakers',
          bg: 'bg-purple-950/80 border-purple-500/50 text-purple-300',
          dot: 'bg-purple-400 animate-pulse',
        };
      case 'waiting_for_blackbox':
      default:
        return {
          label: 'INTERCOM READY • AWAITING BLACK BOX',
          sub: 'Listening for iPhone audio stream input',
          bg: 'bg-slate-900 border-slate-800 text-slate-300',
          dot: 'bg-cyan-400',
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="bg-[#0b101d] border border-slate-800/90 rounded-2xl p-5 shadow-2xl flex flex-col space-y-4">
      {/* HEADER WITH DUAL AI BADGES */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-gradient-to-tr from-cyan-600/30 to-purple-600/30 border border-cyan-500/40 rounded-xl text-cyan-300">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center space-x-2">
              <span>Dual AI Intercom Protocol</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/60">
                TURN-TAKING ENGINE
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Internal AI (SONY TV / Browser Voice) ⇄ Black Box AI (iPhone Source)
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center space-x-1.5 transition border ${
              showConfig
                ? 'bg-cyan-950 border-cyan-600 text-cyan-300'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          <button
            onClick={onClearHistory}
            className="p-1.5 rounded-lg text-xs text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            title="Reset Intercom History"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ACTIVE TURN MONITOR BANNER */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${badge.bg}`}>
        <div className="flex items-center space-x-3">
          <span className={`w-3.5 h-3.5 rounded-full ${badge.dot} shrink-0`} />
          <div>
            <div className="text-xs font-mono font-bold tracking-wider">{badge.label}</div>
            <div className="text-[11px] text-slate-300 opacity-90">{badge.sub}</div>
          </div>
        </div>

        {/* Turn Action Buttons */}
        <div className="flex items-center space-x-2">
          {turnState === 'blackbox_speaking' || turnState === 'waiting_for_blackbox' ? (
            <button
              onClick={onTriggerInternalAi}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-mono font-semibold flex items-center space-x-1.5 shadow-md shadow-purple-950/60 transition"
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>Yield to Internal AI</span>
            </button>
          ) : (
            <button
              onClick={onReleaseTurnToBlackBox}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-mono font-semibold flex items-center space-x-1.5 shadow-md shadow-emerald-950/60 transition"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Yield to Black Box AI</span>
            </button>
          )}
        </div>
      </div>

      {/* COLLAPSIBLE INTERCOM CONFIGURATION */}
      {showConfig && (
        <div className="p-4 bg-slate-950/90 rounded-xl border border-slate-800 space-y-3.5 text-xs animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Autonomous Turn-Taking</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={intercomConfig.autoTurnEnabled}
                onChange={(e) =>
                  onConfigChange({ ...intercomConfig, autoTurnEnabled: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Automatically detects when Black Box finishes speaking and triggers Internal AI response after pause.
          </p>

          <div>
            <div className="flex justify-between items-center mb-1 text-slate-300 font-medium">
              <span>Silence Handover Threshold</span>
              <span className="font-mono text-cyan-400">
                {(intercomConfig.silenceThresholdMs / 1000).toFixed(1)}s
              </span>
            </div>
            <input
              type="range"
              min="800"
              max="3500"
              step="100"
              value={intercomConfig.silenceThresholdMs}
              onChange={(e) =>
                onConfigChange({
                  ...intercomConfig,
                  silenceThresholdMs: parseInt(e.target.value, 10),
                })
              }
              className="w-full accent-cyan-500"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold text-white">Intercom Radio Roger Chirp</span>
            <input
              type="checkbox"
              checked={intercomConfig.intercomChirpEnabled}
              onChange={(e) =>
                onConfigChange({
                  ...intercomConfig,
                  intercomChirpEnabled: e.target.checked,
                })
              }
              className="w-4 h-4 accent-cyan-500 rounded cursor-pointer"
            />
          </div>

          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <span className="block font-semibold text-white">AI Persona & Behavior Prompt</span>
            <textarea
              value={intercomConfig.personaPrompt}
              onChange={(e) =>
                onConfigChange({
                  ...intercomConfig,
                  personaPrompt: e.target.value,
                })
              }
              rows={3}
              placeholder="Enter custom persona prompt (e.g. You are a cinematic film director, sharp, witty, and concise...)"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition resize-none font-mono"
            />
            <p className="text-[10px] text-slate-400">
              Changes take effect immediately on the next AI turn.
            </p>
          </div>
        </div>
      )}

      {/* DUAL AI DIALOGUE FEED */}
      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
        {intercomMessages.length === 0 ? (
          <div className="p-6 text-center text-slate-500 font-mono text-xs border border-dashed border-slate-800 rounded-xl">
            Channel is clear. Black Box AI or Internal AI can open transmission.
          </div>
        ) : (
          intercomMessages.map((msg) => {
            const isBlackBox = msg.speaker === 'blackbox-iphone';
            return (
              <div
                key={msg.id}
                className={`p-3.5 rounded-xl border text-xs leading-relaxed transition ${
                  isBlackBox
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-100 mr-4'
                    : 'bg-purple-950/30 border-purple-500/30 text-purple-100 ml-4'
                }`}
              >
                <div className="flex items-center justify-between mb-1 text-[10px] font-mono">
                  <div className="flex items-center space-x-1.5 font-bold">
                    {isBlackBox ? (
                      <>
                        <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-300 uppercase">Black Box AI (iPhone)</span>
                      </>
                    ) : (
                      <>
                        <Bot className="w-3.5 h-3.5 text-purple-400" />
                        <span className="text-purple-300 uppercase">Local Internal AI (Browser Voice)</span>
                      </>
                    )}
                  </div>
                  <span className="text-slate-500">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm font-normal text-slate-100 mt-1">{msg.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
