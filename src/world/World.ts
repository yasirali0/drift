import { Terrain } from './Terrain';
import { Water } from './Water';
import { Clock } from './Clock';
import { Weather } from './Weather';
import { Flora } from '../life/Flora';
import { Fauna, FaunaState } from '../life/Fauna';
import { SeededRandom } from '../utils/random';

export interface WorldState {
  seed: number;
  worldHour: number;
  savedAt: number;
  terrainHeight: number[];
  waterLevel: number[];
  floraType: number[];
  floraStage: number[];
  floraAge: number[];
  floraHealth: number[];
  fauna?: FaunaState;
}

export const WORLD_SIZE = 256;

export class World {
  readonly seed: number;
  readonly terrain: Terrain;
  readonly water: Water;
  readonly clock: Clock;
  readonly weather: Weather;
  readonly flora: Flora;
  readonly fauna: Fauna;

  private rng: SeededRandom;
  private tickCount = 0;

  constructor(seed: number) {
    this.seed = seed;
    this.terrain = new Terrain(WORLD_SIZE, seed);
    this.water = new Water(WORLD_SIZE);
    this.clock = new Clock();
    this.weather = new Weather(seed + 2000);
    this.flora = new Flora(WORLD_SIZE, seed);
    this.fauna = new Fauna(seed);
    this.rng = new SeededRandom(seed + 3000);

    this.flora.seed(this.terrain);
    this.fauna.seed(this.terrain);
  }

  tick(): void {
    this.tickCount++;
    this.clock.tick();
    this.weather.tick(this.clock);

    // Rain adds water to random cells
    if (this.weather.isRaining && this.tickCount % 3 === 0) {
      for (let i = 0; i < 50; i++) {
        const x = this.rng.nextInt(WORLD_SIZE);
        const y = this.rng.nextInt(WORLD_SIZE);
        this.water.addWater(x, y, this.weather.rainIntensity * 0.01);
      }
    }

    // Water flow
    if (this.tickCount % 2 === 0) {
      this.water.tick(this.terrain);
    }

    // Erosion
    if (this.tickCount % 100 === 0) {
      this.water.erode(this.terrain);
    }

    // Plants
    this.flora.tick(this.terrain, this.water, this.clock, this.weather);

    // Creatures
    this.fauna.tick(this.terrain, this.flora, this.water);
  }

  serialize(): WorldState {
    return {
      seed: this.seed,
      worldHour: this.clock.worldHour,
      savedAt: Date.now(),
      terrainHeight: Array.from(this.terrain.height, (v) =>
        Math.round(v * 10000) / 10000,
      ),
      waterLevel: Array.from(this.water.level, (v) =>
        Math.round(v * 10000) / 10000,
      ),
      floraType: Array.from(this.flora.type),
      floraStage: Array.from(this.flora.stage),
      floraAge: Array.from(this.flora.age),
      floraHealth: Array.from(this.flora.health),
      fauna: this.fauna.serialize(),
    };
  }

  static deserialize(state: WorldState): World {
    const world = new World(state.seed);
    world.clock.worldHour = state.worldHour;

    for (let i = 0; i < state.terrainHeight.length; i++) {
      world.terrain.height[i] = state.terrainHeight[i];
    }
    for (let i = 0; i < state.waterLevel.length; i++) {
      world.water.level[i] = state.waterLevel[i];
    }
    for (let i = 0; i < state.floraType.length; i++) {
      world.flora.type[i] = state.floraType[i];
      world.flora.stage[i] = state.floraStage[i];
      world.flora.age[i] = state.floraAge[i];
      world.flora.health[i] = state.floraHealth[i];
    }

    if (state.fauna) {
      const restoredFauna = Fauna.deserialize(state.fauna, state.seed);
      (world as { fauna: Fauna }).fauna = restoredFauna;
    }

    return world;
  }
}
