import { World } from '../world/World';

export interface TimeWarpResult {
  elapsedHours: number;
  elapsedDays: number;
  elapsedYears: number;
  events: string[];
}

export class TimeWarp {
  static readonly TICKS_PER_SECOND = 1;
  static readonly MAX_TICKS = 200_000;

  fastForward(world: World, elapsedMs: number): TimeWarpResult {
    const elapsedSeconds = elapsedMs / 1000;
    let ticksToSimulate = Math.floor(
      elapsedSeconds * TimeWarp.TICKS_PER_SECOND,
    );
    const capped = ticksToSimulate > TimeWarp.MAX_TICKS;
    ticksToSimulate = Math.min(ticksToSimulate, TimeWarp.MAX_TICKS);

    const startYear = world.clock.year;
    const startPlants = world.flora.countPlants();
    const startFauna = world.fauna.getStats();
    const startHour = world.clock.worldHour;

    for (let i = 0; i < ticksToSimulate; i++) {
      world.tick();
    }

    const endPlants = world.flora.countPlants();
    const endFauna = world.fauna.getStats();
    const elapsedHours = world.clock.worldHour - startHour;
    const elapsedDays = elapsedHours / world.clock.hoursPerDay;
    const elapsedYears =
      elapsedHours / (world.clock.hoursPerDay * world.clock.daysPerYear);

    // Build narrative events
    const events: string[] = [];

    const yearsPassed = world.clock.year - startYear;
    if (yearsPassed > 0) {
      events.push(
        `${yearsPassed} year${yearsPassed > 1 ? 's' : ''} passed in the world`,
      );
    } else {
      events.push(`${Math.floor(elapsedDays)} days passed in the world`);
    }

    const treeDiff = endPlants.tree - startPlants.tree;
    if (Math.abs(treeDiff) > 10) {
      events.push(
        treeDiff > 0
          ? `Forests expanded \u2014 ${treeDiff} new trees grew`
          : `Forests receded \u2014 ${Math.abs(treeDiff)} trees perished`,
      );
    }

    const flowerDiff = endPlants.flower - startPlants.flower;
    if (Math.abs(flowerDiff) > 20) {
      events.push(
        flowerDiff > 0
          ? 'Wildflowers bloomed across the meadows'
          : 'Many wildflowers withered',
      );
    }

    const bushDiff = endPlants.bush - startPlants.bush;
    if (Math.abs(bushDiff) > 15) {
      events.push(
        bushDiff > 0
          ? 'Thickets of bushes spread through the lowlands'
          : 'Bushes thinned under harsh conditions',
      );
    }

    if (world.clock.season === 3) {
      events.push('Winter has settled upon the land');
    } else if (world.clock.season === 0) {
      events.push('Spring has arrived \u2014 new life stirs');
    }

    // Fauna events
    const herbDiff = endFauna.herbivores - startFauna.herbivores;
    if (Math.abs(herbDiff) > 5) {
      events.push(
        herbDiff > 0
          ? `Herbivore herds grew to ${endFauna.herbivores}`
          : `Herbivore numbers fell to ${endFauna.herbivores}`,
      );
    }

    const predDiff = endFauna.predators - startFauna.predators;
    if (Math.abs(predDiff) > 2) {
      events.push(
        predDiff > 0
          ? `Predator packs expanded to ${endFauna.predators}`
          : `Predators declined to ${endFauna.predators}`,
      );
    }

    if (endFauna.maxGeneration > startFauna.maxGeneration + 2) {
      events.push(
        `Creatures evolved to generation ${endFauna.maxGeneration}`,
      );
    }

    if (capped) {
      events.push('(Time was too vast to simulate fully)');
    }

    return { elapsedHours, elapsedDays, elapsedYears, events };
  }
}
