import { Creature, CreatureState, Diet } from './Creature';
import { Terrain, Biome } from '../world/Terrain';
import { Flora, PlantType, GrowthStage } from './Flora';
import { Water } from '../world/Water';
import { SeededRandom } from '../utils/random';

export function updateBehavior(
  creature: Creature,
  allCreatures: Creature[],
  terrain: Terrain,
  flora: Flora,
  water: Water,
  rng: SeededRandom,
): Creature | null {
  if (!creature.isAlive) return null;

  creature.age++;
  creature.energy -= creature.energyCostPerTick;
  creature.stateTimer--;
  if (creature.reproductionCooldown > 0) creature.reproductionCooldown--;

  // Death from starvation or old age
  if (creature.energy <= 0 || creature.age > creature.maxAge) {
    creature.die();
    return null;
  }

  // Bounds check
  const size = terrain.size;
  const cx = Math.floor(creature.x);
  const cy = Math.floor(creature.y);

  // Die if in deep water
  if (terrain.getBiome(cx, cy) === Biome.DEEP_WATER) {
    creature.energy -= 0.02;
  }

  // Drown in water
  if (water.getLevel(cx, cy) > 0.5) {
    creature.energy -= 0.01;
  }

  // State machine
  let offspring: Creature | null = null;

  switch (creature.state) {
    case CreatureState.WANDERING:
      offspring = doWander(creature, allCreatures, terrain, flora, rng, size);
      break;
    case CreatureState.SEEKING_FOOD:
      doSeekFood(creature, terrain, flora, rng, size);
      break;
    case CreatureState.FLEEING:
      doFlee(creature, allCreatures, rng, size);
      break;
    case CreatureState.HUNTING:
      doHunt(creature, allCreatures, rng, size);
      break;
    case CreatureState.RESTING:
      doRest(creature, rng);
      break;
  }

  // Clamp position
  creature.x = Math.max(0, Math.min(size - 1, creature.x));
  creature.y = Math.max(0, Math.min(size - 1, creature.y));

  return offspring;
}

function doWander(
  c: Creature,
  all: Creature[],
  terrain: Terrain,
  flora: Flora,
  rng: SeededRandom,
  size: number,
): Creature | null {
  // ─── Boids flocking ───────────────────────────────────
  // Compute separation / alignment / cohesion from same-diet neighbors
  const flockRadius = c.visionRadius;
  const sepDist = 2.5; // minimum desired spacing
  let sepX = 0, sepY = 0;
  let alignX = 0, alignY = 0;
  let cohX = 0, cohY = 0;
  let neighbors = 0;

  for (const other of all) {
    if (other.id === c.id || !other.isAlive) continue;
    if (other.diet !== c.diet) continue;

    const ddx = c.x - other.x;
    const ddy = c.y - other.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 > flockRadius * flockRadius || d2 < 0.001) continue;

    const d = Math.sqrt(d2);
    neighbors++;

    // Separation: push away from too-close neighbors
    if (d < sepDist) {
      const force = (sepDist - d) / sepDist;
      sepX += (ddx / d) * force;
      sepY += (ddy / d) * force;
    }

    // Alignment: accumulate headings
    alignX += other.dx;
    alignY += other.dy;

    // Cohesion: accumulate positions
    cohX += other.x;
    cohY += other.y;
  }

  // Blend forces into direction
  if (neighbors > 0) {
    // Normalize alignment
    alignX /= neighbors;
    alignY /= neighbors;

    // Cohesion → steer toward center of mass
    cohX = cohX / neighbors - c.x;
    cohY = cohY / neighbors - c.y;

    // Weights differ by diet: herbivores flock tighter, predators looser
    const wSep = 1.5;
    const wAlign = c.isPredator ? 0.8 : 0.5;
    const wCoh = c.isPredator ? 0.2 : 0.6;
    const wWander = 0.3;

    // Small random wander nudge
    const wanderAngle = rng.next() * Math.PI * 2;
    const wandX = Math.cos(wanderAngle) * wWander;
    const wandY = Math.sin(wanderAngle) * wWander;

    const steerX = sepX * wSep + alignX * wAlign + cohX * wCoh + wandX;
    const steerY = sepY * wSep + alignY * wAlign + cohY * wCoh + wandY;

    const mag = Math.sqrt(steerX * steerX + steerY * steerY);
    if (mag > 0.01) {
      c.dx = steerX / mag;
      c.dy = steerY / mag;
    }
  } else {
    // No neighbors — pure random wander
    if (c.stateTimer <= 0) {
      const angle = rng.next() * Math.PI * 2;
      c.dx = Math.cos(angle);
      c.dy = Math.sin(angle);
      c.stateTimer = 20 + rng.nextInt(40);
    }
  }

  move(c, size, terrain);

  // Check for threats (herbivores)
  if (!c.isPredator) {
    const threat = findNearest(c, all, true, c.visionRadius);
    if (threat) {
      c.state = CreatureState.FLEEING;
      c.targetId = threat.id;
      c.stateTimer = 30;
      return null;
    }
  }

  // Check for food need
  if (c.energy < c.maxEnergy * 0.5) {
    if (c.isPredator) {
      const prey = findNearest(c, all, false, c.visionRadius);
      if (prey) {
        c.state = CreatureState.HUNTING;
        c.targetId = prey.id;
        c.stateTimer = 60;
        return null;
      }
    }
    c.state = CreatureState.SEEKING_FOOD;
    c.stateTimer = 40;
    return null;
  }

  // Try to reproduce
  if (c.canReproduce) {
    const mate = findMate(c, all, c.visionRadius * 0.7);
    if (mate) {
      return c.reproduce(mate, rng);
    }
  }

  // Rest if well-fed
  if (c.energy > c.maxEnergy * 0.8 && rng.chance(0.02)) {
    c.state = CreatureState.RESTING;
    c.stateTimer = 30 + rng.nextInt(30);
  }

  return null;
}

function doSeekFood(
  c: Creature,
  terrain: Terrain,
  flora: Flora,
  rng: SeededRandom,
  size: number,
): void {
  if (c.isPredator) {
    // Predators go back to wandering to find prey
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
    return;
  }

  // Herbivore: look for plants to eat
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);

  const plantType = flora.getType(cx, cy);
  if (
    plantType !== PlantType.NONE &&
    flora.getStage(cx, cy) >= GrowthStage.YOUNG
  ) {
    // Eat! Gain energy, damage plant
    const nutrition = plantType === PlantType.TREE ? 0.06 : 0.04;
    c.energy = Math.min(c.maxEnergy, c.energy + nutrition);
    const i = cy * flora.size + cx;
    flora.health[i] = Math.max(0, flora.health[i] - 15);
    c.state = CreatureState.WANDERING;
    c.stateTimer = 10;
    return;
  }

  // Move toward nearest plant
  let bestDist = Infinity;
  let bestX = c.x;
  let bestY = c.y;
  const vr = Math.ceil(c.visionRadius);

  for (let dy = -vr; dy <= vr; dy += 2) {
    for (let dx = -vr; dx <= vr; dx += 2) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || px >= size || py < 0 || py >= size) continue;
      if (flora.getType(px, py) !== PlantType.NONE) {
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestX = px;
          bestY = py;
        }
      }
    }
  }

  if (bestDist < Infinity) {
    const angle = Math.atan2(bestY - c.y, bestX - c.x);
    c.dx = Math.cos(angle);
    c.dy = Math.sin(angle);
  } else {
    const angle = rng.next() * Math.PI * 2;
    c.dx = Math.cos(angle);
    c.dy = Math.sin(angle);
  }

  move(c, size, terrain);

  if (c.stateTimer <= 0) {
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
  }
}

function doFlee(
  c: Creature,
  all: Creature[],
  rng: SeededRandom,
  size: number,
): void {
  const threat = all.find((o) => o.id === c.targetId && o.isAlive);
  if (!threat || dist(c, threat) > c.visionRadius * 1.5) {
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
    return;
  }

  // Run away
  const angle = Math.atan2(c.y - threat.y, c.x - threat.x);
  c.dx = Math.cos(angle);
  c.dy = Math.sin(angle);

  // Flee with a speed boost
  const fleeSpeed = c.moveSpeed * 1.3;
  c.x += c.dx * fleeSpeed;
  c.y += c.dy * fleeSpeed;
  c.x = Math.max(0, Math.min(size - 1, c.x));
  c.y = Math.max(0, Math.min(size - 1, c.y));

  // Extra energy cost for sprinting
  c.energy -= 0.003;

  if (c.stateTimer <= 0) {
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
  }
}

function doHunt(
  c: Creature,
  all: Creature[],
  rng: SeededRandom,
  size: number,
): void {
  const prey = all.find((o) => o.id === c.targetId && o.isAlive);
  if (!prey || dist(c, prey) > c.visionRadius * 2) {
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
    return;
  }

  // Chase
  const angle = Math.atan2(prey.y - c.y, prey.x - c.x);
  c.dx = Math.cos(angle);
  c.dy = Math.sin(angle);

  const huntSpeed = c.moveSpeed * 1.1;
  c.x += c.dx * huntSpeed;
  c.y += c.dy * huntSpeed;
  c.x = Math.max(0, Math.min(size - 1, c.x));
  c.y = Math.max(0, Math.min(size - 1, c.y));

  // Catch prey
  if (dist(c, prey) < 1.5) {
    // Attack - size advantage matters
    const attackPower = c.genes.size * c.genes.aggression;
    const defensePower = prey.genes.size * (1 - prey.genes.aggression) * 0.5 + prey.genes.speed * 0.3;

    if (attackPower > defensePower * rng.nextRange(0.5, 1.5)) {
      prey.die();
      c.energy = Math.min(c.maxEnergy, c.energy + prey.genes.size * 0.5);
      c.state = CreatureState.RESTING;
      c.stateTimer = 20;
    } else {
      // Failed attack, prey escapes
      c.energy -= 0.05;
      c.state = CreatureState.WANDERING;
      c.stateTimer = 20;
    }
  }

  if (c.stateTimer <= 0) {
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
  }
}

function doRest(c: Creature, rng: SeededRandom): void {
  // Recover a tiny bit
  c.energy = Math.min(c.maxEnergy, c.energy + 0.001);

  if (c.stateTimer <= 0) {
    c.state = CreatureState.WANDERING;
    c.stateTimer = 0;
  }
}

function move(c: Creature, size: number, terrain: Terrain): void {
  const nx = c.x + c.dx * c.moveSpeed;
  const ny = c.y + c.dy * c.moveSpeed;

  // Avoid going into deep water
  const biome = terrain.getBiome(Math.floor(nx), Math.floor(ny));
  if (biome === Biome.DEEP_WATER) {
    // Bounce
    c.dx = -c.dx + (Math.random() - 0.5) * 0.5;
    c.dy = -c.dy + (Math.random() - 0.5) * 0.5;
    return;
  }

  // Slower on mountains and snow
  let speedMod = 1;
  if (biome === Biome.MOUNTAIN) speedMod = 0.6;
  if (biome === Biome.SNOW) speedMod = 0.4;
  if (biome === Biome.WATER) speedMod = 0.3;

  c.x += c.dx * c.moveSpeed * speedMod;
  c.y += c.dy * c.moveSpeed * speedMod;
}

function findNearest(
  c: Creature,
  all: Creature[],
  isPredator: boolean,
  radius: number,
): Creature | null {
  let best: Creature | null = null;
  let bestDist = radius * radius;

  for (const other of all) {
    if (other.id === c.id || !other.isAlive) continue;
    if (other.isPredator !== isPredator) continue;

    // Camouflage reduces effective detection
    const effectiveRadius = radius * (1 - other.genes.camouflage * 0.5);
    const d = distSq(c, other);
    if (d < effectiveRadius * effectiveRadius && d < bestDist) {
      bestDist = d;
      best = other;
    }
  }

  return best;
}

function findMate(
  c: Creature,
  all: Creature[],
  radius: number,
): Creature | null {
  let best: Creature | null = null;
  let bestDist = radius * radius;

  for (const other of all) {
    if (other.id === c.id || !other.isAlive) continue;
    if (other.diet !== c.diet) continue;
    if (!other.canReproduce) continue;

    const d = distSq(c, other);
    if (d < bestDist) {
      bestDist = d;
      best = other;
    }
  }

  return best;
}

function dist(a: Creature, b: Creature): number {
  return Math.sqrt(distSq(a, b));
}

function distSq(a: Creature, b: Creature): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}
