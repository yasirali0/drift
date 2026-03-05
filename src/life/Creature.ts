import { Genes, crossover, mutate } from './Genes';
import { SeededRandom } from '../utils/random';

export enum CreatureState {
  WANDERING,
  SEEKING_FOOD,
  FLEEING,
  HUNTING,
  RESTING,
  DEAD,
}

export enum Diet {
  HERBIVORE,
  PREDATOR,
}

let nextCreatureId = 1;

export class Creature {
  readonly id: number;
  readonly genes: Genes;
  readonly diet: Diet;
  readonly generation: number;

  x: number;
  y: number;
  energy: number;
  age: number;
  state: CreatureState;

  // Movement direction
  dx: number = 0;
  dy: number = 0;

  // Behavioral timers
  stateTimer: number = 0;
  restTimer: number = 0;
  reproductionCooldown: number = 0;

  // Target for hunting/fleeing
  targetId: number = -1;

  constructor(
    x: number,
    y: number,
    genes: Genes,
    diet: Diet,
    generation: number = 0,
  ) {
    this.id = nextCreatureId++;
    this.x = x;
    this.y = y;
    this.genes = genes;
    this.diet = diet;
    this.generation = generation;
    this.age = 0;
    this.energy = 0.5 + genes.size * 0.3;
    this.state = CreatureState.WANDERING;
  }

  get maxEnergy(): number {
    return 0.5 + this.genes.size * 1.0;
  }

  get maxAge(): number {
    // Larger + slower metabolism = longer life
    return 3000 + this.genes.size * 2000 + (1 - this.genes.metabolism) * 3000;
  }

  get moveSpeed(): number {
    return 0.3 + this.genes.speed * 1.2;
  }

  get visionRadius(): number {
    return 3 + this.genes.vision * 12;
  }

  get energyCostPerTick(): number {
    return 0.002 + this.genes.metabolism * 0.004 + this.genes.speed * 0.002 + this.genes.size * 0.002;
  }

  get isPredator(): boolean {
    return this.diet === Diet.PREDATOR;
  }

  get isAlive(): boolean {
    return this.state !== CreatureState.DEAD;
  }

  get canReproduce(): boolean {
    return (
      this.energy > this.maxEnergy * 0.6 &&
      this.age > 200 &&
      this.reproductionCooldown <= 0
    );
  }

  reproduce(mate: Creature, rng: SeededRandom): Creature | null {
    if (!this.canReproduce || !mate.canReproduce) return null;

    const childGenes = mutate(crossover(this.genes, mate.genes, rng), rng);
    const childX = this.x + rng.nextRange(-1, 1);
    const childY = this.y + rng.nextRange(-1, 1);
    const child = new Creature(childX, childY, childGenes, this.diet, Math.max(this.generation, mate.generation) + 1);

    // Energy cost
    const cost = 0.3;
    this.energy -= cost;
    mate.energy -= cost;
    this.reproductionCooldown = 300 + (1 - this.genes.fertility) * 500;
    mate.reproductionCooldown = 300 + (1 - mate.genes.fertility) * 500;

    return child;
  }

  die(): void {
    this.state = CreatureState.DEAD;
  }

  static resetIdCounter(): void {
    nextCreatureId = 1;
  }
}
