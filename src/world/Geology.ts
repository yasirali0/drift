import { Terrain } from './Terrain';
import { Flora, PlantType } from '../life/Flora';
import { Creature, CreatureState } from '../life/Creature';
import { EventJournal } from './EventJournal';
import { Clock } from './Clock';
import { SeededRandom } from '../utils/random';
import { WORLD_SIZE } from './World';

/** Active geological events that affect terrain over time. */
export interface GeoEvent {
  type: 'volcano' | 'earthquake';
  cx: number;          // center x
  cy: number;          // center y
  radius: number;      // affected radius
  age: number;         // ticks since event
  maxAge: number;      // ticks until fully cooled / settled
  intensity: number;   // 0-1 initial strength
}

export interface GeologyState {
  events: GeoEvent[];
  /** Per-cell lava heat 0-255 — decays over time, affects terrain color */
  heat: number[];
}

const MIN_EVENT_INTERVAL = 300;    // ~62 days (at 1 tick per 5 world-ticks)
const MAX_EVENT_INTERVAL = 800;    // ~167 days
const MAX_ACTIVE_EVENTS = 3;
const HEAT_DECAY_RATE = 0.3;       // Heat lost per tick while cooling

export class Geology {
  events: GeoEvent[] = [];
  /** Per-cell heat from lava/seismic activity. 0 = cool, 255 = molten. */
  heat: Uint8Array;

  private rng: SeededRandom;
  private nextEventIn: number;
  private size: number;

  constructor(seed: number) {
    this.size = WORLD_SIZE;
    this.heat = new Uint8Array(this.size * this.size);
    this.rng = new SeededRandom(seed + 9000);
    this.nextEventIn = MIN_EVENT_INTERVAL + this.rng.nextInt(MAX_EVENT_INTERVAL - MIN_EVENT_INTERVAL);
  }

  tick(
    terrain: Terrain,
    flora: Flora,
    creatures: Creature[],
    journal: EventJournal,
    clock: Clock,
  ): void {
    // Count down to next event
    this.nextEventIn--;
    if (this.nextEventIn <= 0 && this.events.length < MAX_ACTIVE_EVENTS) {
      this.triggerRandomEvent(terrain, flora, creatures, journal, clock);
      this.nextEventIn = MIN_EVENT_INTERVAL + this.rng.nextInt(MAX_EVENT_INTERVAL - MIN_EVENT_INTERVAL);
    }

    // Advance active events
    for (const ev of this.events) {
      ev.age++;
    }

    // Remove expired events
    this.events = this.events.filter(ev => ev.age < ev.maxAge);

    // Cool heat globally (every 3 ticks for performance)
    this.coolHeat();
  }

  private triggerRandomEvent(
    terrain: Terrain,
    flora: Flora,
    creatures: Creature[],
    journal: EventJournal,
    clock: Clock,
  ): void {
    const roll = this.rng.next();

    if (roll < 0.55) {
      // Volcano — prefer mountain peaks
      const peak = this.pickVolcanoSite(terrain);
      if (peak) {
        this.triggerVolcano(peak.x, peak.y, terrain, flora, creatures, journal, clock);
      }
    } else {
      // Earthquake — random land position
      const margin = Math.floor(this.size * 0.15);
      let cx = 0, cy = 0;
      for (let attempt = 0; attempt < 30; attempt++) {
        cx = margin + this.rng.nextInt(this.size - margin * 2);
        cy = margin + this.rng.nextInt(this.size - margin * 2);
        if (terrain.isLand(cx, cy)) break;
      }
      if (!terrain.isLand(cx, cy)) return;
      this.triggerEarthquake(cx, cy, terrain, flora, creatures, journal, clock);
    }
  }

  /** Pick a volcano eruption site — strongly biased toward mountain peaks. */
  private pickVolcanoSite(terrain: Terrain): { x: number; y: number } | null {
    const peaks = terrain.peaks;

    // 80% chance to erupt at/near an existing mountain peak
    if (peaks.length > 0 && this.rng.next() < 0.8) {
      // Weighted by prominence — taller peaks more volcanic
      const weights = peaks.map(p => p.prominence * p.prominence);
      const total = weights.reduce((a, b) => a + b, 0);
      let r = this.rng.next() * total;
      let chosen = peaks[0];
      for (let i = 0; i < peaks.length; i++) {
        r -= weights[i];
        if (r <= 0) { chosen = peaks[i]; break; }
      }
      // Scatter slightly from peak center (within ~20 cells)
      const ox = Math.floor((this.rng.next() - 0.5) * 40);
      const oy = Math.floor((this.rng.next() - 0.5) * 40);
      const cx = Math.max(0, Math.min(this.size - 1, chosen.x + ox));
      const cy = Math.max(0, Math.min(this.size - 1, chosen.y + oy));
      if (terrain.isLand(cx, cy)) return { x: cx, y: cy };
    }

    // Fallback: find any high-elevation land cell
    const margin = Math.floor(this.size * 0.15);
    for (let attempt = 0; attempt < 30; attempt++) {
      const cx = margin + this.rng.nextInt(this.size - margin * 2);
      const cy = margin + this.rng.nextInt(this.size - margin * 2);
      if (terrain.getHeight(cx, cy) >= 0.55) return { x: cx, y: cy };
    }
    return null;
  }

  private triggerVolcano(
    cx: number, cy: number,
    terrain: Terrain, flora: Flora, creatures: Creature[],
    journal: EventJournal, clock: Clock,
  ): void {
    const radius = 18 + this.rng.nextInt(22); // 18-40 cells
    const intensity = 0.6 + this.rng.next() * 0.4;
    const liftAmount = 0.06 + intensity * 0.08; // Terrain height raise

    const ev: GeoEvent = {
      type: 'volcano', cx, cy, radius, age: 0,
      maxAge: 800 + this.rng.nextInt(400), // 800-1200 ticks to cool
      intensity,
    };
    this.events.push(ev);

    const s = this.size;
    const r2 = radius * radius;

    // Raise terrain & apply heat in radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;

        const px = cx + dx;
        const py = cy + dy;
        if (px < 0 || px >= s || py < 0 || py >= s) continue;

        const i = py * s + px;
        const falloff = 1.0 - Math.sqrt(d2) / radius;
        const ff2 = falloff * falloff; // Quadratic falloff

        // Raise terrain at center
        terrain.height[i] = Math.min(1.0, terrain.height[i] + liftAmount * ff2);

        // Apply heat
        const heatVal = Math.floor(255 * intensity * ff2);
        this.heat[i] = Math.min(255, this.heat[i] + heatVal);

        // Kill flora in hot zone
        if (ff2 > 0.15) {
          flora.type[i] = PlantType.NONE;
          flora.stage[i] = 0;
          flora.age[i] = 0;
          flora.health[i] = 0;
        }
      }
    }

    // Panic nearby creatures
    const fleeRadius = radius * 2.5;
    for (const c of creatures) {
      if (!c.isAlive) continue;
      const cdx = c.x - cx;
      const cdy = c.y - cy;
      const dist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (dist < fleeRadius) {
        c.state = CreatureState.FLEEING;
        c.stateTimer = 30 + Math.floor(Math.random() * 20);
        // Push away from eruption
        if (dist > 0.1) {
          c.dx = cdx / dist;
          c.dy = cdy / dist;
        }
        // Damage creatures very close to center
        if (dist < radius * 0.3) {
          c.energy -= 0.3 * intensity;
        }
      }
    }

    journal.log(clock.worldHour,
      `🌋 A volcano erupts! Terrain rises and lava flows near (${cx}, ${cy})`,
      'ecology');
  }

  private triggerEarthquake(
    cx: number, cy: number,
    terrain: Terrain, flora: Flora, creatures: Creature[],
    journal: EventJournal, clock: Clock,
  ): void {
    // Earthquake along a fault line through (cx, cy)
    const angle = this.rng.next() * Math.PI;
    const length = 40 + this.rng.nextInt(60); // 40-100 cells long
    const width = 8 + this.rng.nextInt(10);   // 8-18 cells wide
    const intensity = 0.5 + this.rng.next() * 0.5;
    const shiftAmount = 0.03 + intensity * 0.04; // Random height perturbation

    const ev: GeoEvent = {
      type: 'earthquake', cx, cy, radius: length,
      age: 0, maxAge: 300 + this.rng.nextInt(200),
      intensity,
    };
    this.events.push(ev);

    const s = this.size;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Walk along fault line
    for (let t = -length / 2; t <= length / 2; t++) {
      const fx = Math.round(cx + cosA * t);
      const fy = Math.round(cy + sinA * t);

      // Affect cells across the width
      for (let w = -width; w <= width; w++) {
        const px = Math.round(fx - sinA * w);
        const py = Math.round(fy + cosA * w);
        if (px < 0 || px >= s || py < 0 || py >= s) continue;

        const i = py * s + px;
        const widthFalloff = 1.0 - Math.abs(w) / width;

        // Shift terrain up on one side, down on the other
        const sign = w > 0 ? 1 : -1;
        const shift = sign * shiftAmount * widthFalloff * intensity;
        terrain.height[i] = Math.max(0, Math.min(1.0, terrain.height[i] + shift));

        // Add some random perturbation near the fault
        if (Math.abs(w) < width * 0.4) {
          const jitter = (this.rng.next() - 0.5) * shiftAmount * 0.5;
          terrain.height[i] = Math.max(0, Math.min(1.0, terrain.height[i] + jitter));

          // Apply mild heat along fault
          this.heat[i] = Math.min(255, this.heat[i] + Math.floor(80 * widthFalloff));
        }

        // Damage flora near the fault center
        if (Math.abs(w) < width * 0.3 && this.rng.next() < 0.6) {
          flora.type[i] = PlantType.NONE;
          flora.stage[i] = 0;
          flora.age[i] = 0;
          flora.health[i] = 0;
        }
      }
    }

    // Panic creatures in affected area
    const panicRadius = length * 0.8;
    for (const c of creatures) {
      if (!c.isAlive) continue;
      const cdx = c.x - cx;
      const cdy = c.y - cy;
      const dist = Math.sqrt(cdx * cdx + cdy * cdy);
      if (dist < panicRadius) {
        c.state = CreatureState.FLEEING;
        c.stateTimer = 20 + Math.floor(Math.random() * 15);
        // Random flee direction (earthquake chaos)
        const a = Math.random() * Math.PI * 2;
        c.dx = Math.cos(a);
        c.dy = Math.sin(a);
      }
    }

    journal.log(clock.worldHour,
      `🫨 An earthquake shakes the island! A fault opens near (${cx}, ${cy})`,
      'ecology');
  }

  private coolHeat(): void {
    const h = this.heat;
    for (let i = 0; i < h.length; i++) {
      if (h[i] > 0) {
        h[i] = Math.max(0, h[i] - HEAT_DECAY_RATE) | 0;
      }
    }
  }

  /** Check if a cell is too hot for plants to grow (heat > 100). */
  isHot(x: number, y: number): boolean {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return false;
    return this.heat[y * this.size + x] > 100;
  }

  serialize(): GeologyState {
    return {
      events: this.events.map(e => ({ ...e })),
      heat: Array.from(this.heat),
    };
  }

  static deserialize(state: GeologyState, seed: number): Geology {
    const geo = new Geology(seed);
    geo.events = state.events.map(e => ({ ...e }));
    for (let i = 0; i < state.heat.length && i < geo.heat.length; i++) {
      geo.heat[i] = state.heat[i];
    }
    return geo;
  }
}
