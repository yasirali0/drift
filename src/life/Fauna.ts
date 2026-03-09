import { Creature, CreatureState, Diet } from './Creature';
import { Genes, herbivoreGenes, predatorGenes } from './Genes';
import { updateBehavior } from './Behavior';
import { Terrain, Biome } from '../world/Terrain';
import { Flora } from './Flora';
import { Water } from '../world/Water';
import { SeededRandom } from '../utils/random';

export interface FaunaStats {
  herbivores: number;
  predators: number;
  totalBirths: number;
  totalDeaths: number;
  maxGeneration: number;
  avgHerbivoreSpeed: number;
  avgPredatorSpeed: number;
}

export interface FaunaState {
  creatures: {
    x: number;
    y: number;
    genes: Genes;
    diet: number;
    generation: number;
    energy: number;
    age: number;
    state: number;
    reproductionCooldown: number;
  }[];
  totalBirths: number;
  totalDeaths: number;
}

const MAX_CREATURES = 1800;
const SPAWN_INTERVAL = 200;

export class Fauna {
  creatures: Creature[] = [];
  totalBirths = 0;
  totalDeaths = 0;

  private rng: SeededRandom;
  private tickCount = 0;

  constructor(seed: number) {
    this.rng = new SeededRandom(seed + 7000);
  }

  seed(terrain: Terrain): void {
    // Spawn initial herbivores on grassland/forest
    for (let i = 0; i < 180; i++) {
      const pos = this.findLandPos(terrain);
      if (!pos) continue;
      const genes = herbivoreGenes(this.rng);
      const c = new Creature(pos[0], pos[1], genes, Diet.HERBIVORE, 0);
      c.energy = c.maxEnergy * 0.7;
      this.creatures.push(c);
    }

    // Spawn initial predators — fewer
    for (let i = 0; i < 45; i++) {
      const pos = this.findLandPos(terrain);
      if (!pos) continue;
      const genes = predatorGenes(this.rng);
      const c = new Creature(pos[0], pos[1], genes, Diet.PREDATOR, 0);
      c.energy = c.maxEnergy * 0.8;
      this.creatures.push(c);
    }

    this.totalBirths = this.creatures.length;
  }

  tick(terrain: Terrain, flora: Flora, water: Water): void {
    this.tickCount++;

    const newborns: Creature[] = [];

    for (const creature of this.creatures) {
      if (!creature.isAlive) continue;

      const offspring = updateBehavior(
        creature,
        this.creatures,
        terrain,
        flora,
        water,
        this.rng,
      );

      if (offspring && this.creatures.length + newborns.length < MAX_CREATURES) {
        newborns.push(offspring);
      }
    }

    // Count deaths
    const before = this.creatures.length;
    this.creatures = this.creatures.filter((c) => c.isAlive);
    this.totalDeaths += before - this.creatures.length;

    // Add newborns
    this.creatures.push(...newborns);
    this.totalBirths += newborns.length;

    // Emergency respawn if populations crash too low
    if (this.tickCount % SPAWN_INTERVAL === 0) {
      const stats = this.getStats();
      if (stats.herbivores < 10) {
        for (let i = 0; i < 8; i++) {
          const pos = this.findLandPos(terrain);
          if (!pos) continue;
          const genes = herbivoreGenes(this.rng);
          const c = new Creature(pos[0], pos[1], genes, Diet.HERBIVORE, 0);
          c.energy = c.maxEnergy * 0.7;
          this.creatures.push(c);
        }
      }
      if (stats.predators < 3) {
        for (let i = 0; i < 3; i++) {
          const pos = this.findLandPos(terrain);
          if (!pos) continue;
          const genes = predatorGenes(this.rng);
          const c = new Creature(pos[0], pos[1], genes, Diet.PREDATOR, 0);
          c.energy = c.maxEnergy * 0.8;
          this.creatures.push(c);
        }
      }
    }
  }

  getStats(): FaunaStats {
    let herbivores = 0;
    let predators = 0;
    let maxGen = 0;
    let herbSpeedSum = 0;
    let predSpeedSum = 0;

    for (const c of this.creatures) {
      if (!c.isAlive) continue;
      if (c.diet === Diet.HERBIVORE) {
        herbivores++;
        herbSpeedSum += c.genes.speed;
      } else {
        predators++;
        predSpeedSum += c.genes.speed;
      }
      if (c.generation > maxGen) maxGen = c.generation;
    }

    return {
      herbivores,
      predators,
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
      maxGeneration: maxGen,
      avgHerbivoreSpeed: herbivores > 0 ? herbSpeedSum / herbivores : 0,
      avgPredatorSpeed: predators > 0 ? predSpeedSum / predators : 0,
    };
  }

  private findLandPos(terrain: Terrain): [number, number] | null {
    for (let attempt = 0; attempt < 50; attempt++) {
      const x = this.rng.nextInt(terrain.size);
      const y = this.rng.nextInt(terrain.size);
      const biome = terrain.getBiome(x, y);
      if (
        biome === Biome.GRASSLAND ||
        biome === Biome.FOREST ||
        biome === Biome.DENSE_FOREST
      ) {
        return [x, y];
      }
    }
    return null;
  }

  serialize(): FaunaState {
    return {
      creatures: this.creatures
        .filter((c) => c.isAlive)
        .map((c) => ({
          x: Math.round(c.x * 100) / 100,
          y: Math.round(c.y * 100) / 100,
          genes: { ...c.genes },
          diet: c.diet,
          generation: c.generation,
          energy: Math.round(c.energy * 1000) / 1000,
          age: c.age,
          state: c.state,
          reproductionCooldown: c.reproductionCooldown,
        })),
      totalBirths: this.totalBirths,
      totalDeaths: this.totalDeaths,
    };
  }

  static deserialize(state: FaunaState, seed: number): Fauna {
    const fauna = new Fauna(seed);
    fauna.totalBirths = state.totalBirths;
    fauna.totalDeaths = state.totalDeaths;

    Creature.resetIdCounter();
    for (const cs of state.creatures) {
      const c = new Creature(
        cs.x,
        cs.y,
        cs.genes,
        cs.diet as Diet,
        cs.generation,
      );
      c.energy = cs.energy;
      c.age = cs.age;
      c.state = cs.state as CreatureState;
      c.reproductionCooldown = cs.reproductionCooldown;
      fauna.creatures.push(c);
    }

    return fauna;
  }
}
