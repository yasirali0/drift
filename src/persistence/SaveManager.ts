import { World, WorldState } from '../world/World';

const SAVE_KEY = 'drift_world_save';

export class SaveManager {
  save(world: World): void {
    const state = world.serialize();
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch {
      console.warn('Drift: failed to save world state');
    }
  }

  load(): WorldState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as WorldState;
    } catch {
      return null;
    }
  }

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  }
}
