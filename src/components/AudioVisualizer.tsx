import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isActive: boolean;
  theme?: 'tv-cinematic' | 'iphone-compact';
  label?: string;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  analyser,
  isActive,
  theme = 'tv-cinematic',
  label = 'SONY TV AUDIO MONITOR',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bufferLength = analyser ? analyser.frequencyBinCount : 64;
    let dataArray = new Uint8Array(bufferLength);
    let timeArray = new Uint8Array(bufferLength);

    const render = () => {
      animFrameRef.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      // Clear with dark cinema background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Draw subtle grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 1;
      for (let y = 10; y < height; y += 25) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (!analyser || !isActive) {
        // Idle heartbeat line
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('STANDBY • NO ACTIVE AUDIO INPUT', width / 2, height / 2 - 10);
        return;
      }

      analyser.getByteFrequencyData(dataArray);
      analyser.getByteTimeDomainData(timeArray);

      // 1. Draw Spectrum Bars
      const barCount = theme === 'tv-cinematic' ? 48 : 28;
      const barWidth = (width / barCount) - 2;
      let x = 1;

      for (let i = 0; i < barCount; i++) {
        // Sample frequency with non-linear distribution (more detail in human vocal range 200Hz - 4kHz)
        const freqIndex = Math.min(bufferLength - 1, Math.floor(Math.pow(i / barCount, 1.4) * (bufferLength / 2)));
        const val = dataArray[freqIndex] || 0;
        const barHeight = (val / 255) * (height - 20);

        // Color gradient based on intensity (cyan to amber to neon red)
        let barColor = '#06b6d4'; // cyan
        if (val > 175) {
          barColor = '#f59e0b'; // amber
        }
        if (val > 230) {
          barColor = '#ef4444'; // red (peak)
        }

        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, 'rgba(6, 182, 212, 0.15)');
        gradient.addColorStop(1, barColor);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth, barHeight);

        // Bar peak cap
        ctx.fillStyle = barColor;
        ctx.fillRect(x, Math.max(2, height - barHeight - 2), barWidth, 2);

        x += barWidth + 2;
      }

      // 2. Draw Smooth Oscilloscope Waveform overlay
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 8;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let waveX = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = timeArray[i] / 128.0;
        const waveY = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(waveX, waveY);
        } else {
          ctx.lineTo(waveX, waveY);
        }
        waveX += sliceWidth;
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadow
    };

    render();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [analyser, isActive, theme]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-[#070b12] shadow-2xl">
      <div className="absolute top-2.5 left-3 z-10 flex items-center space-x-2 text-[10px] font-mono tracking-wider">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
          }`}
        />
        <span className="text-slate-300 font-semibold">{label}</span>
      </div>

      <div className="absolute top-2.5 right-3 z-10 flex items-center space-x-3 text-[10px] font-mono text-slate-400">
        <span>48kHz / 16-BIT</span>
        <span className="text-cyan-400 font-bold">OPUS LOW-LATENCY</span>
      </div>

      <canvas
        ref={canvasRef}
        width={theme === 'tv-cinematic' ? 780 : 360}
        height={theme === 'tv-cinematic' ? 140 : 90}
        className="w-full h-auto block"
      />
    </div>
  );
};
