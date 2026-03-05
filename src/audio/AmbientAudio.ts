/**
 * Procedural ambient audio system using Web Audio API.
 *
 * Layers (all generated, no samples):
 *  - Wind:     filtered brown noise, intensity varies with weather wind speed
 *  - Rain:     filtered white noise, present only when raining
 *  - Birds:    random chirp oscillators during daytime (hours 6-19)
 *  - Crickets: pulsing high-frequency oscillator at night (hours 20-5)
 *  - Water:    low rumble when near water (always gentle)
 */

export interface AudioState {
  /** 0-1 daylight level */
  daylight: number;
  /** 0-23 hour */
  hour: number;
  /** 0-3 season index */
  season: number;
  /** true when raining */
  isRaining: boolean;
  /** 0-1 rain intensity */
  rainIntensity: number;
  /** wind speed magnitude 0-1 */
  windStrength: number;
  /** simulation paused? */
  paused: boolean;
}

// Master volume (0-1) — keep it subtle
const MASTER = 0.35;

export class AmbientAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private started = false;

  // --- layer nodes ---
  private windSource!: AudioBufferSourceNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;

  private rainSource!: AudioBufferSourceNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;

  private birdGain!: GainNode;
  private birdTimer = 0;

  private cricketOsc!: OscillatorNode;
  private cricketGain!: GainNode;
  private cricketLfo!: OscillatorNode;
  private cricketLfoGain!: GainNode;

  private waterGain!: GainNode;
  private waterSource!: AudioBufferSourceNode;
  private waterFilter!: BiquadFilterNode;

  /**
   * Must be called from a user gesture (click/key) to satisfy autoplay policy.
   */
  init(): void {
    if (this.ctx) return;

    this.ctx = new AudioContext();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = MASTER;
    this.master.connect(ctx.destination);

    this.initWind(ctx);
    this.initRain(ctx);
    this.initBirds(ctx);
    this.initCrickets(ctx);
    this.initWater(ctx);

    this.started = true;
  }

  // ─── Wind ──────────────────────────────────────────────────────

  private initWind(ctx: AudioContext): void {
    const buf = this.createBrownNoise(ctx, 4);
    this.windSource = ctx.createBufferSource();
    this.windSource.buffer = buf;
    this.windSource.loop = true;

    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 300;
    this.windFilter.Q.value = 0.5;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;

    this.windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    this.windSource.start();
  }

  // ─── Rain ──────────────────────────────────────────────────────

  private initRain(ctx: AudioContext): void {
    const buf = this.createWhiteNoise(ctx, 4);
    this.rainSource = ctx.createBufferSource();
    this.rainSource.buffer = buf;
    this.rainSource.loop = true;

    this.rainFilter = ctx.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 8000;
    this.rainFilter.Q.value = 0.3;

    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;

    this.rainSource.connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.master);
    this.rainSource.start();
  }

  // ─── Birds ─────────────────────────────────────────────────────

  private initBirds(ctx: AudioContext): void {
    this.birdGain = ctx.createGain();
    this.birdGain.gain.value = 0;
    this.birdGain.connect(this.master);
  }

  private spawnChirp(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // Random chirp: short sine sweep
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreq = 2000 + Math.random() * 3000;
    const now = ctx.currentTime;
    const duration = 0.06 + Math.random() * 0.12;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * (0.8 + Math.random() * 0.5), now + duration);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15 + Math.random() * 0.1, now + 0.01);
    gain.gain.linearRampToValueAtTime(0, now + duration);

    osc.connect(gain);
    gain.connect(this.birdGain);
    osc.start(now);
    osc.stop(now + duration + 0.01);

    // Sometimes do a quick two-note chirp
    if (Math.random() < 0.5) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      const t2 = now + duration + 0.03;
      const freq2 = baseFreq * (0.9 + Math.random() * 0.3);
      const dur2 = 0.04 + Math.random() * 0.08;

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(freq2, t2);
      osc2.frequency.linearRampToValueAtTime(freq2 * 1.1, t2 + dur2);

      gain2.gain.setValueAtTime(0, t2);
      gain2.gain.linearRampToValueAtTime(0.12, t2 + 0.01);
      gain2.gain.linearRampToValueAtTime(0, t2 + dur2);

      osc2.connect(gain2);
      gain2.connect(this.birdGain);
      osc2.start(t2);
      osc2.stop(t2 + dur2 + 0.01);
    }
  }

  // ─── Crickets ──────────────────────────────────────────────────

  private initCrickets(ctx: AudioContext): void {
    this.cricketOsc = ctx.createOscillator();
    this.cricketOsc.type = 'sine';
    this.cricketOsc.frequency.value = 4800;

    // LFO to pulse the crickets
    this.cricketLfo = ctx.createOscillator();
    this.cricketLfo.type = 'square';
    this.cricketLfo.frequency.value = 12; // rapid pulsing

    this.cricketLfoGain = ctx.createGain();
    this.cricketLfoGain.gain.value = 0.04;

    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;

    // LFO modulates the cricket gain
    this.cricketLfo.connect(this.cricketLfoGain);
    this.cricketLfoGain.connect(this.cricketGain.gain);

    this.cricketOsc.connect(this.cricketGain);
    this.cricketGain.connect(this.master);

    this.cricketOsc.start();
    this.cricketLfo.start();
  }

  // ─── Water ─────────────────────────────────────────────────────

  private initWater(ctx: AudioContext): void {
    const buf = this.createBrownNoise(ctx, 4);
    this.waterSource = ctx.createBufferSource();
    this.waterSource.buffer = buf;
    this.waterSource.loop = true;

    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 500;
    this.waterFilter.Q.value = 1.0;

    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;

    this.waterSource.connect(this.waterFilter);
    this.waterFilter.connect(this.waterGain);
    this.waterGain.connect(this.master);
    this.waterSource.start();
  }

  // ─── Update (called every frame) ──────────────────────────────

  update(state: AudioState, dt: number): void {
    if (!this.started || !this.ctx) return;

    // Resume context if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const t = this.ctx.currentTime;
    const ramp = 0.3; // smoothing time in seconds

    // --- Master mute when paused ---
    const targetMaster = state.paused ? 0 : MASTER;
    this.master.gain.setTargetAtTime(targetMaster, t, ramp);

    // --- Wind ---
    // Base wind always present at low level; increases with wind strength and during storms
    const baseWind = 0.08;
    const stormWind = state.isRaining ? state.rainIntensity * 0.3 : 0;
    const windTarget = baseWind + state.windStrength * 0.35 + stormWind;
    this.windGain.gain.setTargetAtTime(Math.min(windTarget, 0.7), t, ramp);
    // Higher freq cutoff in stronger wind
    const windFreq = 200 + state.windStrength * 400 + stormWind * 600;
    this.windFilter.frequency.setTargetAtTime(windFreq, t, ramp);

    // Winter makes wind howl more
    if (state.season === 3) {
      this.windFilter.frequency.setTargetAtTime(windFreq + 200, t, ramp);
    }

    // --- Rain ---
    const rainTarget = state.isRaining ? state.rainIntensity * 0.5 : 0;
    this.rainGain.gain.setTargetAtTime(rainTarget, t, ramp * 2);

    // --- Birds ---
    const isDaytime = state.hour >= 6 && state.hour <= 19;
    // More birds in spring/summer, dawn chorus (hour 6-8)
    let birdActivity = 0;
    if (isDaytime && !state.isRaining) {
      birdActivity = state.season <= 1 ? 0.8 : 0.3; // spring/summer vs autumn
      if (state.season === 3) birdActivity = 0; // no birds in winter
      // Dawn chorus
      if (state.hour >= 6 && state.hour <= 8) birdActivity *= 2.0;
    }
    this.birdGain.gain.setTargetAtTime(Math.min(birdActivity, 1.0), t, ramp);

    // Spawn chirps randomly
    this.birdTimer -= dt;
    if (this.birdTimer <= 0 && birdActivity > 0) {
      this.spawnChirp();
      // More frequent chirps when activity is high
      this.birdTimer = (0.3 + Math.random() * 1.5) / Math.max(birdActivity, 0.1);
    }

    // --- Crickets ---
    const isNight = state.hour >= 20 || state.hour <= 4;
    let cricketTarget = 0;
    if (isNight && !state.isRaining && state.season !== 3) {
      cricketTarget = state.season === 1 ? 0.08 : 0.04; // louder in summer
    }
    this.cricketGain.gain.setTargetAtTime(cricketTarget, t, ramp * 3);

    // --- Water ambient ---
    // Gentle constant background
    this.waterGain.gain.setTargetAtTime(0.06, t, ramp);
  }

  // ─── Noise generators ─────────────────────────────────────────

  private createWhiteNoise(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const length = sr * durationSec;
    const buf = ctx.createBuffer(1, length, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  private createBrownNoise(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sr = ctx.sampleRate;
    const length = sr * durationSec;
    const buf = ctx.createBuffer(1, length, sr);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5; // amplify slightly
    }
    return buf;
  }
}
