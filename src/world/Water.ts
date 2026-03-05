import { Terrain } from './Terrain';

export class Water {
  readonly size: number;
  readonly level: Float32Array;
  private readonly temp: Float32Array;

  constructor(size: number) {
    this.size = size;
    this.level = new Float32Array(size * size);
    this.temp = new Float32Array(size * size);
  }

  getLevel(x: number, y: number): number {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
    return this.level[y * this.size + x];
  }

  addWater(x: number, y: number, amount: number): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return;
    this.level[y * this.size + x] += amount;
  }

  tick(terrain: Terrain): void {
    const s = this.size;
    this.temp.set(this.level);

    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ];
    const flowRate = 0.1;

    for (let y = 1; y < s - 1; y++) {
      for (let x = 1; x < s - 1; x++) {
        const i = y * s + x;
        const waterHere = this.temp[i];
        if (waterHere <= 0) continue;

        const totalHere = terrain.height[i] + waterHere;

        for (const [dx, dy] of dirs) {
          const ni = (y + dy) * s + (x + dx);
          const totalThere = terrain.height[ni] + this.temp[ni];

          if (totalHere > totalThere) {
            const diff = (totalHere - totalThere) * flowRate;
            const flow = Math.min(diff, waterHere / 4);
            this.level[i] -= flow;
            this.level[ni] += flow;
          }
        }
      }
    }

    // Evaporation
    for (let i = 0; i < s * s; i++) {
      this.level[i] = Math.max(0, this.level[i] - 0.0001);
    }
  }

  erode(terrain: Terrain): void {
    const s = this.size;
    for (let i = 0; i < s * s; i++) {
      if (this.level[i] > 0.01) {
        terrain.height[i] -= this.level[i] * 0.00001;
      }
    }
  }
}
