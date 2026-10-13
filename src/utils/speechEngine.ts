import { VoiceSettings } from '../types';

export interface VoiceOption {
  voiceURI: string;
  name: string;
  lang: string;
  isDefault: boolean;
  localService: boolean;
}

// Global cached voices list
let cachedVoices: SpeechSynthesisVoice[] = [];

export function getBrowserVoices(): Promise<VoiceOption[]> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve([]);
      return;
    }

    const mapVoices = (voices: SpeechSynthesisVoice[]): VoiceOption[] => {
      cachedVoices = voices;
      return voices.map((v) => ({
        voiceURI: v.voiceURI,
        name: v.name,
        lang: v.lang,
        isDefault: Boolean(v.default),
        localService: v.localService,
      }));
    };

    const initial = window.speechSynthesis.getVoices();
    if (initial && initial.length > 0) {
      resolve(mapVoices(initial));
      return;
    }

    // Chrome/Safari asynchronously loads voices
    const handleVoicesChanged = () => {
      const voices = window.speechSynthesis.getVoices();
      resolve(mapVoices(voices));
    };

    window.speechSynthesis.onvoiceschanged = handleVoicesChanged;

    // Timeout fallback if onvoiceschanged doesn't fire
    setTimeout(() => {
      const fallback = window.speechSynthesis.getVoices();
      resolve(mapVoices(fallback));
    }, 600);
  });
}

/**
 * Returns the system Default Browser Voice
 */
export function getDefaultBrowserVoice(): VoiceOption | null {
  if (cachedVoices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    cachedVoices = window.speechSynthesis.getVoices();
  }

  if (cachedVoices.length === 0) return null;

  // 1. Look for explicit default flag
  const defaultVoice = cachedVoices.find((v) => v.default);
  if (defaultVoice) {
    return {
      voiceURI: defaultVoice.voiceURI,
      name: defaultVoice.name,
      lang: defaultVoice.lang,
      isDefault: true,
      localService: defaultVoice.localService,
    };
  }

  // 2. Look for primary matching system voice (e.g. en-US)
  const langMatch = cachedVoices.find((v) => v.lang.startsWith('en')) || cachedVoices[0];
  return {
    voiceURI: langMatch.voiceURI,
    name: langMatch.name,
    lang: langMatch.lang,
    isDefault: false,
    localService: langMatch.localService,
  };
}

/**
 * Speaks text using the Browser Voice via window.speechSynthesis
 */
export function speakBrowserVoice(
  text: string,
  settings?: Partial<VoiceSettings>,
  onEnd?: () => void
): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    console.warn('SpeechSynthesis is not supported in this environment');
    return false;
  }

  if (!text || text.trim() === '') return false;

  window.speechSynthesis.cancel(); // Cancel any ongoing utterance to prioritize immediate speech

  const utterance = new SpeechSynthesisUtterance(text.trim());
  utterance.rate = settings?.rate ?? 1.0;
  utterance.pitch = settings?.pitch ?? 1.0;
  utterance.volume = settings?.volume ?? 1.0;

  if (settings?.voiceURI) {
    const matchedVoice = cachedVoices.find((v) => v.voiceURI === settings.voiceURI);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    }
  } else {
    // Pick default browser voice
    const def = cachedVoices.find((v) => v.default) || cachedVoices[0];
    if (def) {
      utterance.voice = def;
    }
  }

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = () => onEnd();
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopBrowserVoice(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// ----------------------------------------------------
// Real-time Speech-to-Text Transcription via Web Speech API
// ----------------------------------------------------

// Types for Web Speech Recognition API
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: {
    readonly isFinal: boolean;
    readonly length: number;
    [index: number]: SpeechRecognitionResultItem;
  };
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onend: ((this: ISpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: ISpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: ISpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export class LiveTranscriber {
  private recognition: ISpeechRecognition | null = null;
  private isRunning = false;
  private shouldKeepRunning = false;
  private onTranscriptCallback: ((text: string, isFinal: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStatusChangeCallback: ((active: boolean) => void) | null = null;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Recognition) {
      try {
        const instance = new Recognition();
        instance.continuous = true;
        instance.interimResults = true;
        instance.lang = navigator.language || 'en-US';
        instance.maxAlternatives = 1;

        instance.onstart = () => {
          this.isRunning = true;
          this.onStatusChangeCallback?.(true);
        };

        instance.onresult = (event: SpeechRecognitionEvent) => {
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const transcriptText = result[0]?.transcript || '';
            const isFinal = result.isFinal;
            if (transcriptText.trim()) {
              this.onTranscriptCallback?.(transcriptText.trim(), isFinal);
            }
          }
        };

        instance.onerror = (event: SpeechRecognitionErrorEvent) => {
          // Ignore normal silent pauses
          if (event.error === 'no-speech') return;
          console.warn('SpeechRecognition error:', event.error);
          this.onErrorCallback?.(event.error);
        };

        instance.onend = () => {
          this.isRunning = false;
          this.onStatusChangeCallback?.(false);

          // If intentional continuous mode, auto-restart seamlessly
          if (this.shouldKeepRunning) {
            this.restartTimeout = setTimeout(() => {
              if (this.shouldKeepRunning && !this.isRunning) {
                try {
                  this.recognition?.start();
                } catch {
                  // Ignore if already started
                }
              }
            }, 250);
          }
        };

        this.recognition = instance;
      } catch (err) {
        console.error('Failed to construct SpeechRecognition:', err);
      }
    }
  }

  public start(
    onTranscript: (text: string, isFinal: boolean) => void,
    onError?: (err: string) => void,
    onStatusChange?: (active: boolean) => void
  ): boolean {
    if (!this.recognition) return false;

    this.onTranscriptCallback = onTranscript;
    this.onErrorCallback = onError || null;
    this.onStatusChangeCallback = onStatusChange || null;
    this.shouldKeepRunning = true;

    if (!this.isRunning) {
      try {
        this.recognition.start();
        return true;
      } catch (e) {
        console.warn('SpeechRecognition start failed or already active:', e);
        return false;
      }
    }
    return true;
  }

  public stop(): void {
    this.shouldKeepRunning = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition && this.isRunning) {
      try {
        this.recognition.stop();
      } catch {
        // Safe ignore
      }
    }
    this.isRunning = false;
    this.onStatusChangeCallback?.(false);
  }

  public get active(): boolean {
    return this.isRunning;
  }
}
