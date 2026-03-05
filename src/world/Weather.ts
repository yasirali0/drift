import { Clock } from './Clock';
import { SeededRandom } from '../utils/random';

export class Weather {
  isRaining: boolean = false;
  rainIntensity: number = 0;
  temperature: number = 0.5;
  windX: number = 0;
  windY: number = 0;

  private rng: SeededRandom;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed);
  }

  tick(clock: Clock): void {
    if (this.isRaining) {
      if (this.rng.chance(0.05)) {
        this.isRaining = false;
        this.rainIntensity = 0;
      }
    } else {
      if (this.rng.chance(clock.rainChance * 0.02)) {
        this.isRaining = true;
        this.rainIntensity = this.rng.nextRange(0.3, 1.0);
      }
    }

    const seasonTemp = [0.5, 0.8, 0.5, 0.2][clock.season];
    this.temperature += (seasonTemp - this.temperature) * 0.01;

    this.windX += this.rng.nextRange(-0.1, 0.1);
    this.windY += this.rng.nextRange(-0.1, 0.1);
    this.windX *= 0.95;
    this.windY *= 0.95;
  }
}
