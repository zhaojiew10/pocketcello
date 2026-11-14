export class AudioEngine {
  constructor() {
    this.context = null;
    this.bufferCache = new Map();
    this.activeSources = new Map();
    this.volume = 0.75;
  }

  async unlock() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error('当前浏览器不支持 Web Audio API，请使用新版 Chrome、Edge、Firefox 或 Safari。');
    }

    if (!this.context) this.context = new AudioContextClass();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async load(note) {
    await this.unlock();
    if (this.bufferCache.has(note.midi)) return this.bufferCache.get(note.midi);

    const loading = fetch(note.audio)
      .then((response) => {
        if (!response.ok) throw new Error(`音频加载失败：${note.shortLabel} (${response.status})`);
        return response.arrayBuffer();
      })
      .then((data) => this.context.decodeAudioData(data));

    this.bufferCache.set(note.midi, loading);
    try {
      return await loading;
    } catch (error) {
      this.bufferCache.delete(note.midi);
      throw error;
    }
  }

  async play(note) {
    const buffer = await this.load(note);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();

    source.buffer = buffer;
    gain.gain.value = this.volume;
    source.connect(gain);
    gain.connect(this.context.destination);
    this.activeSources.set(source, gain);

    source.addEventListener('ended', () => this.#cleanup(source), { once: true });
    source.start();
    return source;
  }

  setVolume(value) {
    this.volume = Math.min(1, Math.max(0, Number(value)));
    if (!this.context) return;

    for (const gain of this.activeSources.values()) {
      gain.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    }
  }

  stopAll() {
    for (const source of [...this.activeSources.keys()]) {
      try {
        source.stop();
      } catch {
        // 已结束的音源无需再次停止。
      }
      this.#cleanup(source);
    }
  }

  #cleanup(source) {
    const gain = this.activeSources.get(source);
    if (!gain) return;

    this.activeSources.delete(source);
    source.disconnect();
    gain.disconnect();
  }
}
