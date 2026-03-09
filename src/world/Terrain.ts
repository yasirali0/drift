import { PerlinNoise } from '../utils/noise';
import { SeededRandom } from '../utils/random';

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

/** A mountain peak location with its prominence. */
export interface MountainPeak {
  x: number;
  y: number;
  prominence: number; // 0-1 relative peak height
}

export class Terrain {
  readonly size: number;
  readonly height: Float32Array;
  readonly moisture: Float32Array;
  /** Major peaks detected after generation — used by Geology for volcano placement. */
  readonly peaks: MountainPeak[] = [];

  constructor(size: number, seed: number) {
    this.size = size;
    this.height = new Float32Array(size * size);
    this.moisture = new Float32Array(size * size);

    const heightNoise = new PerlinNoise(seed);
    const ridgeNoise = new PerlinNoise(seed + 500);
    const moistureNoise = new PerlinNoise(seed + 1000);
    const scale = 0.015;

    // Generate mountain ridges: seeded random walk paths through the island
    const ridgeMask = new Float32Array(size * size);
    this.generateRidges(ridgeMask, seed);

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

        // Mountain ridge overlay — broad elevated regions
        const ridge = ridgeMask[i];
        if (ridge > 0) {
          // Ridge noise adds variation so ridges aren't uniform
          const rn = ridgeNoise.octave(x * 0.03, y * 0.03, 3, 0.5);
          const ridgeHeight = ridge * (0.25 + rn * 0.15);
          h = Math.min(1.0, h + ridgeHeight);
        }

        this.height[i] = h;
        this.moisture[i] = moistureNoise.octave(
          x * scale * 1.5,
          y * scale * 1.5,
          4,
          0.6,
        );
      }
    }

    // Detect peaks after full generation
    this.detectPeaks();
  }

  /** Generate mountain ridge paths via seeded random walks from the island interior. */
  private generateRidges(ridgeMask: Float32Array, seed: number): void {
    const rng = new SeededRandom(seed + 7777);
    const s = this.size;
    const numRidges = 3 + rng.nextInt(3); // 3-5 ridge lines
    const center = s / 2;
    const maxIslandRadius = s * 0.38; // ridges must stay within this radius

    for (let r = 0; r < numRidges; r++) {
      // Start each ridge near the island center
      let rx = center + (rng.next() - 0.5) * s * 0.2;
      let ry = center + (rng.next() - 0.5) * s * 0.2;
      let angle = rng.next() * Math.PI * 2;
      const length = 40 + rng.nextInt(50); // 40-90 steps (shorter)
      const baseWidth = 30 + rng.nextInt(25); // 30-55 cells wide (broader)
      const peakIntensity = 0.7 + rng.next() * 0.3; // 0.7-1.0

      for (let step = 0; step < length; step++) {
        // Meander: stronger turns for more natural curves
        angle += (rng.next() - 0.5) * 0.6;

        // Slow step size so ridges don't extend as far
        rx += Math.cos(angle) * 2.0;
        ry += Math.sin(angle) * 2.0;

        // Check distance from center — stop if nearing island edge
        const fdx = (rx - center) / maxIslandRadius;
        const fdy = (ry - center) / maxIslandRadius;
        const edgeDist = Math.sqrt(fdx * fdx + fdy * fdy);
        if (edgeDist > 1.0) break; // past island boundary

        // Island-edge fade: ridges shrink and weaken near the coast
        const islandFade = 1.0 - clamp01(edgeDist) ** 2;

        // Taper intensity at start and end of ridge
        const edgeFade = Math.min(step / 15, (length - step) / 15, 1.0);
        const width = baseWidth * (0.5 + edgeFade * 0.5) * islandFade;
        if (width < 3) continue;

        // Paint ridge influence into mask
        const w = Math.ceil(width);
        const ix0 = Math.max(0, Math.floor(rx - w));
        const ix1 = Math.min(s - 1, Math.floor(rx + w));
        const iy0 = Math.max(0, Math.floor(ry - w));
        const iy1 = Math.min(s - 1, Math.floor(ry + w));

        for (let py = iy0; py <= iy1; py++) {
          for (let px = ix0; px <= ix1; px++) {
            const ddx = px - rx;
            const ddy = py - ry;
            const d = Math.sqrt(ddx * ddx + ddy * ddy);
            if (d < width) {
              // Smooth bell-curve falloff for rounder mountain profiles
              const t = d / width;
              const profile = Math.exp(-3 * t * t);
              const influence = profile * peakIntensity * edgeFade * islandFade;
              const ci = py * s + px;
              ridgeMask[ci] = Math.max(ridgeMask[ci], influence);
            }
          }
        }
      }
    }
  }

  /** Find local maxima in height map to identify mountain peaks. */
  detectPeaks(): void {
    this.peaks.length = 0;
    const s = this.size;
    const step = 8; // Sample every 8 cells
    const minPeakHeight = 0.68;

    for (let y = step; y < s - step; y += step) {
      for (let x = step; x < s - step; x += step) {
        const i = y * s + x;
        const h = this.height[i];
        if (h < minPeakHeight) continue;

        // Check if this is a local maximum in a wider neighborhood
        let isMax = true;
        for (let dy = -step; dy <= step; dy += step) {
          for (let dx = -step; dx <= step; dx += step) {
            if (dx === 0 && dy === 0) continue;
            const ni = (y + dy) * s + (x + dx);
            if (this.height[ni] > h) { isMax = false; break; }
          }
          if (!isMax) break;
        }

        if (isMax) {
          this.peaks.push({ x, y, prominence: h });
        }
      }
    }

    // Sort by prominence (tallest first)
    this.peaks.sort((a, b) => b.prominence - a.prominence);
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
