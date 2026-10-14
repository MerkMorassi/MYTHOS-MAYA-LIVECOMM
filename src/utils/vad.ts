export class VADEngine {
  private analyser: AnalyserNode;
  private threshold: number; // dBFS
  private isActive: boolean = false;
  private onSpeechStart: () => void;
  private onSpeechEnd: () => void;
  private rafId: number | null = null;
  private silenceDuration: number = 0;
  private minSilenceForEnd: number = 500; // ms

  constructor(analyser: AnalyserNode, onSpeechStart: () => void, onSpeechEnd: () => void, threshold: number = -45) {
    this.analyser = analyser;
    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;
    this.threshold = threshold;
  }

  public start() {
    this.isActive = true;
    this.check();
  }

  public stop() {
    this.isActive = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }

  private check() {
    if (!this.isActive) return;

    const dataArray = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i] * dataArray[i];
    }
    const rms = Math.sqrt(sum / dataArray.length);
    const db = rms > 0.0001 ? 20 * Math.log10(rms) : -100;

    if (db > this.threshold) {
      if (!this.isActive) {
        this.onSpeechStart();
      }
      this.silenceDuration = 0;
    } else {
      this.silenceDuration += 100; // Assuming ~100ms interval
      if (this.silenceDuration >= this.minSilenceForEnd && this.isActive) {
        this.onSpeechEnd();
      }
    }

    this.rafId = requestAnimationFrame(() => this.check());
  }
}
