import { PerlinNoise } from '../utils/noise';

export enum Biome {
  DEEP_WATER,
  WATER,
  SAND,
  GRASSLAND,
  FOREST,
  DENSE_FOREST,
  MOUNTAIN,
  SNOW,
}

export class Terrain {
  readonly size: number;
  readonly height: Float32Array;
  readonly moisture: Float32Array;

  constructor(size: number, seed: number) {
    this.size = size;
    this.height = new Float32Array(size * size);
    this.moisture = new Float32Array(size * size);

    const heightNoise = new PerlinNoise(seed);
    const moistureNoise = new PerlinNoise(seed + 1000);
    const scale = 0.015;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;

        let h = heightNoise.octave(x * scale, y * scale, 6, 0.5);

        // Island shape — lower the edges
        const dx = (x / size - 0.5) * 2;
        const dy = (y / size - 0.5) * 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const falloff = 1 - clamp01(dist / 1.0) ** 2;
        h = h * falloff;

        this.height[i] = h;
        this.moisture[i] = moistureNoise.octave(
          x * scale * 1.5,
          y * scale * 1.5,
          4,
          0.6,
        );
      }
    }
  }

  getHeight(x: number, y: number): number {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
    return this.height[y * this.size + x];
  }

  getMoisture(x: number, y: number): number {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
    return this.moisture[y * this.size + x];
  }

  getBiome(x: number, y: number): Biome {
    const h = this.getHeight(x, y);
    const m = this.getMoisture(x, y);

    if (h < 0.25) return Biome.DEEP_WATER;
    if (h < 0.35) return Biome.WATER;
    if (h < 0.38) return Biome.SAND;
    if (h < 0.55) return m > 0.55 ? Biome.FOREST : Biome.GRASSLAND;
    if (h < 0.7) return m > 0.5 ? Biome.DENSE_FOREST : Biome.FOREST;
    if (h < 0.82) return Biome.MOUNTAIN;
    return Biome.SNOW;
  }

  isLand(x: number, y: number): boolean {
    return this.getHeight(x, y) >= 0.35;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
