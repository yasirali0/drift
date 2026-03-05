import { Clock } from '../world/Clock';

export interface JournalEntry {
  worldHour: number;
  text: string;
  category: 'ecology' | 'fauna' | 'weather' | 'milestone';
}

const MAX_ENTRIES = 100;

export class EventJournal {
  entries: JournalEntry[] = [];
  private lastPopCheck = { herbivores: 0, predators: 0, trees: 0 };
  private tickCounter = 0;
  private peakHerbivores = 0;
  private peakPredators = 0;
  private peakGeneration = 0;
  private famineLogged = false;

  log(worldHour: number, text: string, category: JournalEntry['category']): void {
    this.entries.push({ worldHour, text, category });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
    }
  }

  check(
    clock: Clock,
    fauna: { herbivores: number; predators: number; maxGeneration: number },
    flora: { tree: number; grass: number; flower: number; bush: number },
  ): void {
    this.tickCounter++;
    if (this.tickCounter % 120 !== 0) return; // Check every ~24 hours game time

    const wh = clock.worldHour;

    // Population peaks
    if (fauna.herbivores > this.peakHerbivores * 1.5 && fauna.herbivores > 20) {
      this.peakHerbivores = fauna.herbivores;
      this.log(wh, `Herbivore population surges to ${fauna.herbivores}`, 'fauna');
    } else if (fauna.herbivores > this.peakHerbivores) {
      this.peakHerbivores = fauna.herbivores;
    }

    if (fauna.predators > this.peakPredators * 1.5 && fauna.predators > 8) {
      this.peakPredators = fauna.predators;
      this.log(wh, `Predator packs grow to ${fauna.predators}`, 'fauna');
    } else if (fauna.predators > this.peakPredators) {
      this.peakPredators = fauna.predators;
    }

    // Population crashes
    if (fauna.herbivores < this.lastPopCheck.herbivores * 0.5 && this.lastPopCheck.herbivores > 15) {
      this.log(wh, `Herbivore population crashes from ${this.lastPopCheck.herbivores} to ${fauna.herbivores}`, 'fauna');
    }

    if (fauna.predators < this.lastPopCheck.predators * 0.5 && this.lastPopCheck.predators > 5) {
      this.log(wh, `Predators decline sharply to ${fauna.predators}`, 'fauna');
    }

    // Generation milestones
    if (fauna.maxGeneration >= this.peakGeneration + 5) {
      this.peakGeneration = fauna.maxGeneration;
      this.log(wh, `Evolution reaches generation ${fauna.maxGeneration}`, 'milestone');
    }

    // Ecological events
    if (flora.tree < this.lastPopCheck.trees * 0.6 && this.lastPopCheck.trees > 100) {
      this.log(wh, 'Widespread deforestation observed', 'ecology');
    }

    if (flora.tree > this.lastPopCheck.trees * 1.5 && flora.tree > 200) {
      this.log(wh, 'Forest canopy expands rapidly', 'ecology');
    }

    // Famine
    if (fauna.herbivores > 0 && flora.grass + flora.flower + flora.bush < 50 && !this.famineLogged) {
      this.log(wh, 'A great famine sweeps the land', 'ecology');
      this.famineLogged = true;
    } else if (flora.grass + flora.flower + flora.bush > 200) {
      this.famineLogged = false;
    }

    // Season transitions (check day 1 of each season)
    if (clock.dayOfSeason === 1 && clock.hour === 0) {
      const season = clock.seasonName;
      if (season === 'Spring') {
        this.log(wh, `Year ${clock.year} begins \u2014 spring arrives`, 'weather');
      } else if (season === 'Winter') {
        this.log(wh, `Winter descends in year ${clock.year}`, 'weather');
      }
    }

    this.lastPopCheck = {
      herbivores: fauna.herbivores,
      predators: fauna.predators,
      trees: flora.tree,
    };
  }

  getRecent(count: number = 8): JournalEntry[] {
    return this.entries.slice(-count);
  }

  serialize(): JournalEntry[] {
    return [...this.entries];
  }

  static deserialize(entries: JournalEntry[]): EventJournal {
    const journal = new EventJournal();
    journal.entries = entries.slice(-MAX_ENTRIES);
    return journal;
  }
}
