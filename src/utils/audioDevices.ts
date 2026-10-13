import { AudioDeviceOption } from '../types';

// Check if setSinkId is supported (supported in Chrome/Edge on Windows)
export function isSetSinkIdSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'setSinkId' in HTMLAudioElement.prototype;
}

export async function getAudioDevices(): Promise<{
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
}> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return { inputs: [], outputs: [] };
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs: AudioDeviceOption[] = [];
    const outputs: AudioDeviceOption[] = [];

    devices.forEach((dev, index) => {
      if (dev.kind === 'audioinput') {
        inputs.push({
          deviceId: dev.deviceId,
          label: dev.label || `Microphone ${index + 1} (Windows Mic)`,
          kind: 'audioinput',
        });
      } else if (dev.kind === 'audiooutput') {
        const isSony = dev.label.toLowerCase().includes('sony') || dev.label.toLowerCase().includes('tv') || dev.label.toLowerCase().includes('hdmi');
        outputs.push({
          deviceId: dev.deviceId,
          label: dev.label || (isSony ? `SONY TV HDMI Audio (${index + 1})` : `Speakers / Audio Output ${index + 1}`),
          kind: 'audiooutput',
        });
      }
    });

    return { inputs, outputs };
  } catch (err) {
    console.warn('Could not enumerate audio devices:', err);
    return { inputs: [], outputs: [] };
  }
}

/**
 * Play a high quality audio chime test through the selected output (e.g. SONY TV speakers)
 */
export async function playSpeakerTestChime(outputDeviceId?: string): Promise<void> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  // If sink ID is supported and specified on audio element/context
  if (outputDeviceId && 'setSinkId' in ctx) {
    try {
      await (ctx as unknown as { setSinkId: (id: string) => Promise<void> }).setSinkId(outputDeviceId);
    } catch (e) {
      console.warn('Failed to set sinkId on AudioContext:', e);
    }
  }

  const now = ctx.currentTime;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.3, now);
  masterGain.connect(ctx.destination);

  // Play a pleasant warm three-tone chime (C5 -> E5 -> G5)
  const tones = [523.25, 659.25, 783.99];
  tones.forEach((freq, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + idx * 0.12);

    gain.gain.setValueAtTime(0.001, now + idx * 0.12);
    gain.gain.exponentialRampToValueAtTime(0.35, now + idx * 0.12 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.5);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(now + idx * 0.12);
    osc.stop(now + idx * 0.12 + 0.55);
  });

  setTimeout(() => {
    ctx.close().catch(() => {});
  }, 1200);
}

/**
 * Creates an audio analysis pipeline from a MediaStream or AudioNode
 */
export function createAudioAnalyser(
  ctx: AudioContext,
  sourceNode: AudioNode,
  fftSize = 256
): {
  analyser: AnalyserNode;
  getVolumeLevel: () => { rms: number; peak: number; db: number };
  getFrequencyData: (array: Uint8Array) => void;
} {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = 0.8;
  sourceNode.connect(analyser);

  const bufferLength = analyser.fftSize;
  const dataArray = new Float32Array(bufferLength);

  const getVolumeLevel = () => {
    analyser.getFloatTimeDomainData(dataArray);
    let sum = 0;
    let peak = 0;

    for (let i = 0; i < bufferLength; i++) {
      const val = Math.abs(dataArray[i]);
      if (val > peak) peak = val;
      sum += val * val;
    }

    const rms = Math.sqrt(sum / bufferLength);
    // Convert to dBFS (roughly -60dB to 0dB)
    const db = rms > 0.00001 ? Math.max(-60, 20 * Math.log10(rms)) : -60;

    return {
      rms: Math.min(1, rms * 3), // scaled for visualizer
      peak: Math.min(1, peak),
      db: Math.round(db),
    };
  };

  const getFrequencyData = (array: Uint8Array) => {
    analyser.getByteFrequencyData(array as unknown as Uint8Array<ArrayBuffer>);
  };

  return { analyser, getVolumeLevel, getFrequencyData };
}
