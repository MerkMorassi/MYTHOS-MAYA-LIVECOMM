import { IntercomMessage, IntercomTurnState, VoiceSettings } from '../types';
import { speakBrowserVoice } from './speechEngine';
import { LiveVoiceClient } from './webrtcClient';

/**
 * Play authentic studio intercom radio chirps using Web Audio API
 */
export function playIntercomChime(type: 'turn_handover' | 'start_turn' | 'listening'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'turn_handover') {
      // Classic Roger beep / intercom turn handover double-tone (880Hz -> 1320Hz)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.04);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.14);
    } else if (type === 'start_turn') {
      // Soft entrance chime
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now); // D5
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch (err) {
    console.warn('Could not play intercom chime:', err);
  }
}

/**
 * Requests the Internal Local AI to formulate its response via server-side Gemini API
 */
export async function fetchInternalAiResponse(
  history: IntercomMessage[],
  latestUtterance: string,
  personaPrompt?: string
): Promise<string> {
  try {
    const res = await fetch('/api/internal-ai/respond', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        history,
        latestUtterance,
        personaInstruction: personaPrompt,
      }),
    });

    if (!res.ok) {
      throw new Error(`API returned status ${res.status}`);
    }

    const data = await res.json();
    return data.responseText || 'Understood, Black Box. Channel open, proceed.';
  } catch (err) {
    console.error('Failed to fetch internal AI response:', err);
    return 'Transmission acknowledged, Black Box. Proceed with your thought.';
  }
}
