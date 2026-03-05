import { SeededRandom } from '../utils/random';

export interface Genes {
  speed: number;        // 0-1: movement speed
  size: number;         // 0-1: body size (affects energy cost and attack)
  vision: number;       // 0-1: detection radius
  metabolism: number;   // 0-1: energy efficiency (lower = more efficient)
  fertility: number;    // 0-1: reproduction rate
  aggression: number;   // 0-1: tendency to hunt vs flee
  camouflage: number;   // 0-1: harder to detect
  colorR: number;       // 0-1: visual color
  colorG: number;       // 0-1: visual color
  colorB: number;       // 0-1: visual color
}

const GENE_KEYS: (keyof Genes)[] = [
  'speed', 'size', 'vision', 'metabolism', 'fertility',
  'aggression', 'camouflage', 'colorR', 'colorG', 'colorB',
];

export function randomGenes(rng: SeededRandom): Genes {
  return {
    speed: rng.nextRange(0.2, 0.8),
    size: rng.nextRange(0.2, 0.8),
    vision: rng.nextRange(0.2, 0.8),
    metabolism: rng.nextRange(0.3, 0.7),
    fertility: rng.nextRange(0.2, 0.6),
    aggression: rng.nextRange(0.0, 1.0),
    camouflage: rng.nextRange(0.1, 0.5),
    colorR: rng.next(),
    colorG: rng.next(),
    colorB: rng.next(),
  };
}

export function herbivoreGenes(rng: SeededRandom): Genes {
  return {
    speed: rng.nextRange(0.3, 0.7),
    size: rng.nextRange(0.2, 0.5),
    vision: rng.nextRange(0.4, 0.8),
    metabolism: rng.nextRange(0.2, 0.5),
    fertility: rng.nextRange(0.3, 0.7),
    aggression: rng.nextRange(0.0, 0.15),
    camouflage: rng.nextRange(0.3, 0.7),
    colorR: rng.nextRange(0.3, 0.6),
    colorG: rng.nextRange(0.5, 0.9),
    colorB: rng.nextRange(0.1, 0.4),
  };
}

export function predatorGenes(rng: SeededRandom): Genes {
  return {
    speed: rng.nextRange(0.5, 0.9),
    size: rng.nextRange(0.5, 0.9),
    vision: rng.nextRange(0.5, 0.9),
    metabolism: rng.nextRange(0.4, 0.7),
    fertility: rng.nextRange(0.1, 0.4),
    aggression: rng.nextRange(0.6, 1.0),
    camouflage: rng.nextRange(0.1, 0.4),
    colorR: rng.nextRange(0.6, 1.0),
    colorG: rng.nextRange(0.1, 0.5),
    colorB: rng.nextRange(0.1, 0.3),
  };
}

export function crossover(a: Genes, b: Genes, rng: SeededRandom): Genes {
  const child: Partial<Genes> = {};
  for (const key of GENE_KEYS) {
    child[key] = rng.chance(0.5) ? a[key] : b[key];
  }
  return child as Genes;
}

export function mutate(genes: Genes, rng: SeededRandom, rate: number = 0.1): Genes {
  const result = { ...genes };
  for (const key of GENE_KEYS) {
    if (rng.chance(rate)) {
      result[key] = clamp01(result[key] + rng.nextRange(-0.15, 0.15));
    }
  }
  return result;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
