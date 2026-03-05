import { Terrain, Biome } from '../world/Terrain';
import { Water } from '../world/Water';
import { Clock } from '../world/Clock';
import { Weather } from '../world/Weather';
import { SeededRandom } from '../utils/random';

export enum PlantType {
  NONE = 0,
  GRASS = 1,
  FLOWER = 2,
  BUSH = 3,
  TREE = 4,
}

export enum GrowthStage {
  SEED = 0,
  SPROUT = 1,
  YOUNG = 2,
  MATURE = 3,
  OLD = 4,
  DEAD = 5,
}

export class Flora {
  readonly size: number;
  readonly type: Uint8Array;
  readonly stage: Uint8Array;
  readonly age: Uint16Array;
  readonly health: Uint8Array;

  private rng: SeededRandom;
  private tickCounter: number = 0;

  constructor(size: number, seed: number) {
    this.size = size;
    this.type = new Uint8Array(size * size);
    this.stage = new Uint8Array(size * size);
    this.age = new Uint16Array(size * size);
    this.health = new Uint8Array(size * size);
    this.rng = new SeededRandom(seed + 500);
  }

  seed(terrain: Terrain): void {
    const s = this.size;
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const biome = terrain.getBiome(x, y);
        const i = y * s + x;

        if (biome === Biome.GRASSLAND) {
          if (this.rng.chance(0.3)) {
            const pt = this.rng.chance(0.7)
              ? PlantType.GRASS
              : PlantType.FLOWER;
            this.type[i] = pt;
            this.stage[i] = GrowthStage.MATURE;
            this.age[i] = Math.floor(this.getMaxAge(pt) * 0.5);
            this.health[i] = 200;
          }
        } else if (biome === Biome.FOREST) {
          if (this.rng.chance(0.4)) {
            const pt = this.rng.chance(0.5)
              ? PlantType.TREE
              : PlantType.BUSH;
            this.type[i] = pt;
            this.stage[i] = GrowthStage.MATURE;
            this.age[i] = Math.floor(this.getMaxAge(pt) * 0.5);
            this.health[i] = 220;
          }
        } else if (biome === Biome.DENSE_FOREST) {
          if (this.rng.chance(0.6)) {
            const pt = this.rng.chance(0.7)
              ? PlantType.TREE
              : PlantType.BUSH;
            this.type[i] = pt;
            this.stage[i] = GrowthStage.MATURE;
            this.age[i] = Math.floor(this.getMaxAge(pt) * 0.5);
            this.health[i] = 240;
          }
        }
      }
    }
  }

  tick(terrain: Terrain, water: Water, clock: Clock, weather: Weather): void {
    this.tickCounter++;
    const s = this.size;
    const growth = clock.growthMultiplier;

    // Stagger updates: only process every 4th row per tick
    const offset = this.tickCounter % 4;

    for (let y = offset; y < s; y += 4) {
      for (let x = 0; x < s; x++) {
        const i = y * s + x;

        if (this.type[i] === PlantType.NONE) {
          if (terrain.isLand(x, y) && this.rng.chance(0.001 * growth)) {
            this.trySpread(x, y);
          }
          continue;
        }

        // Age
        this.age[i]++;

        // Growth stage transitions
        const maxAge = this.getMaxAge(this.type[i]);
        const ageRatio = this.age[i] / maxAge;

        if (ageRatio < 0.05) this.stage[i] = GrowthStage.SEED;
        else if (ageRatio < 0.15) this.stage[i] = GrowthStage.SPROUT;
        else if (ageRatio < 0.4) this.stage[i] = GrowthStage.YOUNG;
        else if (ageRatio < 0.75) this.stage[i] = GrowthStage.MATURE;
        else if (ageRatio < 1.0) this.stage[i] = GrowthStage.OLD;
        else this.stage[i] = GrowthStage.DEAD;

        // Health — flooding
        const waterLevel = water.getLevel(x, y);
        if (waterLevel > 0.3) {
          this.health[i] = Math.max(0, this.health[i] - 2);
        } else if (weather.isRaining && waterLevel < 0.1) {
          this.health[i] = Math.min(255, this.health[i] + 1);
        }

        // Health — hostile biome
        const biome = terrain.getBiome(x, y);
        if (
          biome === Biome.SAND ||
          biome === Biome.MOUNTAIN ||
          biome === Biome.SNOW
        ) {
          this.health[i] = Math.max(0, this.health[i] - 1);
        }

        // Health — winter
        if (clock.season === 3 && this.type[i] !== PlantType.TREE) {
          this.health[i] = Math.max(0, this.health[i] - 1);
        }

        // Death
        if (this.health[i] === 0 || this.stage[i] === GrowthStage.DEAD) {
          this.type[i] = PlantType.NONE;
          this.stage[i] = 0;
          this.age[i] = 0;
          this.health[i] = 0;
          continue;
        }

        // Spread seeds
        if (
          this.stage[i] === GrowthStage.MATURE &&
          this.rng.chance(0.002 * growth)
        ) {
          this.trySpreadFrom(x, y, terrain);
        }
      }
    }
  }

  private getMaxAge(plantType: number): number {
    switch (plantType) {
      case PlantType.GRASS:
        return 500;
      case PlantType.FLOWER:
        return 300;
      case PlantType.BUSH:
        return 2000;
      case PlantType.TREE:
        return 8000;
      default:
        return 1000;
    }
  }

  private trySpread(x: number, y: number): void {
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];
    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= this.size || ny < 0 || ny >= this.size) continue;
      const ni = ny * this.size + nx;
      if (
        this.type[ni] !== PlantType.NONE &&
        this.stage[ni] >= GrowthStage.MATURE
      ) {
        const i = y * this.size + x;
        this.type[i] = this.type[ni];
        this.stage[i] = GrowthStage.SEED;
        this.age[i] = 0;
        this.health[i] = 150;
        return;
      }
    }
  }

  private trySpreadFrom(x: number, y: number, terrain: Terrain): void {
    const dirs = [
      [-1, 0], [1, 0], [0, -1], [0, 1],
      [-1, -1], [1, -1], [-1, 1], [1, 1],
    ];
    const [dx, dy] = dirs[this.rng.nextInt(8)];
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= this.size || ny < 0 || ny >= this.size) return;

    const ni = ny * this.size + nx;
    if (this.type[ni] !== PlantType.NONE) return;
    if (!terrain.isLand(nx, ny)) return;

    const biome = terrain.getBiome(nx, ny);
    if (biome === Biome.SNOW || biome === Biome.DEEP_WATER) return;

    const i = y * this.size + x;
    this.type[ni] = this.type[i];
    this.stage[ni] = GrowthStage.SEED;
    this.age[ni] = 0;
    this.health[ni] = 150;
  }

  getType(x: number, y: number): PlantType {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size)
      return PlantType.NONE;
    return this.type[y * this.size + x];
  }

  getStage(x: number, y: number): GrowthStage {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size)
      return GrowthStage.SEED;
    return this.stage[y * this.size + x];
  }

  countPlants(): { grass: number; flower: number; bush: number; tree: number } {
    const counts = {
      grass: 0,
      flower: 0,
      bush: 0,
      tree: 0,
    };
    for (let i = 0; i < this.size * this.size; i++) {
      switch (this.type[i]) {
        case PlantType.GRASS:
          counts.grass++;
          break;
        case PlantType.FLOWER:
          counts.flower++;
          break;
        case PlantType.BUSH:
          counts.bush++;
          break;
        case PlantType.TREE:
          counts.tree++;
          break;
      }
    }
    return counts;
  }
}
