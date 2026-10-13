import React, { useEffect, useRef, useState } from 'react';
import { Mic, Radio, Volume2 } from 'lucide-react';

interface IPhoneWaveformVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  isTransmitting: boolean;
}

export const IPhoneWaveformVisualizer: React.FC<IPhoneWaveformVisualizerProps> = ({
  analyser,
  isActive,
  isTransmitting,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [decibels, setDecibels] = useState<number>(-60);
  const [audioDetected, setAudioDetected] = useState<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Retina display scaling
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || 340;
    const displayHeight = canvas.clientHeight || 110;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    ctx.scale(dpr, dpr);

    const bufferLength = analyser ? analyser.frequencyBinCount : 128;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    let phase = 0;

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);
      phase += 0.05;

      const w = displayWidth;
      const h = displayHeight;

      // Dark studio background
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, w, h);

      // Subtle horizontal centerline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();

      if (!analyser || !isActive) {
        // Idle heartbeat wave
        ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x += 3) {
          const y = h / 2 + Math.sin(x * 0.04 + phase) * 2;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.fillStyle = 'rgba(100, 116, 139, 0.6)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('MICROPHONE READY • TAP TO ACTIVATE', w / 2, h / 2 - 8);
        return;
      }

      analyser.getByteTimeDomainData(timeData);
      analyser.getByteFrequencyData(freqData);

      // Calculate instantaneous RMS & peak
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (timeData[i] - 128) / 128;
        sum += val * val;
      }
      const rms = Math.sqrt(sum / bufferLength);
      const db = rms > 0.001 ? Math.max(-60, Math.round(20 * Math.log10(rms))) : -60;
      setDecibels(db);
      setAudioDetected(db > -45);

      // 1. Draw subtle frequency bars in the background
      const barCount = 32;
      const barWidth = (w / barCount) - 2;
      for (let b = 0; b < barCount; b++) {
        const fIdx = Math.floor((b / barCount) * (bufferLength / 2));
        const fVal = freqData[fIdx] || 0;
        const bHeight = (fVal / 255) * (h * 0.45);

        const bx = b * (barWidth + 2);
        ctx.fillStyle = isTransmitting
          ? 'rgba(6, 182, 212, 0.18)'
          : 'rgba(148, 163, 184, 0.1)';
        ctx.fillRect(bx, h - bHeight, barWidth, bHeight);
      }

      // 2. Draw real-time Audio Waveform (Oscilloscope trace)
      ctx.lineWidth = isTransmitting ? 2.5 : 1.5;
      const strokeGrad = ctx.createLinearGradient(0, 0, w, 0);
      if (isTransmitting) {
        strokeGrad.addColorStop(0, '#06b6d4'); // Cyan
        strokeGrad.addColorStop(0.5, '#10b981'); // Emerald
        strokeGrad.addColorStop(1, '#38bdf8'); // Sky blue
      } else {
        strokeGrad.addColorStop(0, '#64748b');
        strokeGrad.addColorStop(1, '#94a3b8');
      }

      ctx.strokeStyle = strokeGrad;
      ctx.shadowColor = isTransmitting ? '#06b6d4' : 'transparent';
      ctx.shadowBlur = isTransmitting && db > -45 ? 10 : 2;

      ctx.beginPath();
      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeData[i] / 128.0; // 0.0 to 2.0
        const y = (v * h) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth;
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // 3. Draw energetic mirrored fill when voice activity is detected
      if (db > -45 && isTransmitting) {
        ctx.beginPath();
        let fillX = 0;
        for (let i = 0; i < bufferLength; i++) {
          const v = timeData[i] / 128.0;
          const y = (v * h) / 2;
          if (i === 0) ctx.moveTo(fillX, y);
          else ctx.lineTo(fillX, y);
          fillX += sliceWidth;
        }
        ctx.lineTo(w, h / 2);
        ctx.lineTo(0, h / 2);
        ctx.closePath();
        ctx.fillStyle = 'rgba(6, 182, 212, 0.08)';
        ctx.fill();
      }
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [analyser, isActive, isTransmitting]);

  return (
    <div className="w-full bg-[#070d18] border border-cyan-900/40 rounded-2xl p-3 shadow-xl relative overflow-hidden">
      {/* Top Telemetry Header */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              isTransmitting
                ? audioDetected
                  ? 'bg-emerald-400 animate-ping'
                  : 'bg-cyan-400 animate-pulse'
                : 'bg-slate-600'
            }`}
          />
          <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-200 flex items-center space-x-1">
            <span>MIC WAVEFORM MONITOR</span>
          </span>
        </div>

        <div className="flex items-center space-x-2 text-[10px] font-mono">
          <span
            className={`px-1.5 py-0.5 rounded font-semibold ${
              isTransmitting && audioDetected
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                : isTransmitting
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-900 text-slate-500 border border-slate-800'
            }`}
          >
            {isTransmitting
              ? audioDetected
                ? 'VOICE DETECTED'
                : 'TRANSMITTING'
              : 'MIC STANDBY'}
          </span>
          <span className="text-cyan-400 font-bold">{decibels} dBFS</span>
        </div>
      </div>

      {/* Real-time Canvas Waveform */}
      <div className="relative w-full h-[96px] rounded-xl overflow-hidden bg-[#050811] border border-slate-800/80">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Live overlay status tag */}
        <div className="absolute bottom-1.5 right-2 pointer-events-none text-[9px] font-mono text-slate-400/80">
          CANVAS API • 48kHz OPUS
        </div>
      </div>
    </div>
  );
};
