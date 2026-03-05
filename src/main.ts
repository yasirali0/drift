import { World, WORLD_SIZE } from './world/World';
import { Renderer } from './render/Renderer';
import { Camera } from './render/Camera';
import { PopulationGraph } from './render/PopulationGraph';
import { SaveManager } from './persistence/SaveManager';
import { TimeWarp, TimeWarpResult } from './persistence/TimeWarp';

class DriftApp {
  private world!: World;
  private renderer!: Renderer;
  private camera!: Camera;
  private saveManager = new SaveManager();
  private timeWarp = new TimeWarp();
  private popGraph!: PopulationGraph;

  private paused = false;
  private tickAccumulator = 0;
  private lastFrameTime = 0;
  private readonly tickRate = 5;

  private uiEl!: HTMLElement;
  private timeWarpEl!: HTMLElement;

  constructor() {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.uiEl = document.getElementById('ui')!;
    this.timeWarpEl = document.getElementById('time-warp')!;

    this.renderer = new Renderer(canvas, WORLD_SIZE);
    this.camera = new Camera(WORLD_SIZE);
    this.popGraph = new PopulationGraph();

    // Try restoring a saved world
    const saved = this.saveManager.load();

    if (saved) {
      this.world = World.deserialize(saved);

      const elapsedMs = Date.now() - saved.savedAt;
      if (elapsedMs > 5000) {
        const result = this.timeWarp.fastForward(this.world, elapsedMs);
        this.showTimeWarp(result, elapsedMs);
      }
    } else {
      this.world = new World(randomSeed());
    }

    this.camera.attach(canvas);
    this.setupControls();
    this.setupAutoSave();

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupControls(): void {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') {
        this.paused = !this.paused;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (confirm('Create a new world? The current one will be lost.')) {
          this.saveManager.clear();
          this.world = new World(randomSeed());
        }
      }
    });

    this.timeWarpEl.addEventListener('click', () => {
      this.timeWarpEl.classList.remove('active');
    });
  }

  private setupAutoSave(): void {
    setInterval(() => this.saveManager.save(this.world), 10_000);
    window.addEventListener('beforeunload', () =>
      this.saveManager.save(this.world),
    );
  }

  private showTimeWarp(result: TimeWarpResult, realMs: number): void {
    const elapsedEl = document.getElementById('time-warp-elapsed')!;
    const eventsEl = document.getElementById('time-warp-events')!;

    const realHours = realMs / (1000 * 60 * 60);
    let realStr: string;
    if (realHours < 1) {
      realStr = `${Math.floor(realMs / 60_000)} minutes`;
    } else if (realHours < 24) {
      realStr = `${Math.floor(realHours)} hours`;
    } else {
      realStr = `${Math.floor(realHours / 24)} days`;
    }

    elapsedEl.textContent = `You were gone for ${realStr}`;
    eventsEl.innerHTML = result.events
      .map((e) => `<div>\u2022 ${e}</div>`)
      .join('');

    this.timeWarpEl.classList.add('active');
  }

  private loop(time: number): void {
    const dt = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;

    if (!this.paused) {
      this.tickAccumulator += dt;
      const interval = 1 / this.tickRate;
      while (this.tickAccumulator >= interval) {
        this.world.tick();
        this.tickAccumulator -= interval;
      }
    }

    this.camera.update();
    this.renderer.render(this.world, this.camera);
    this.popGraph.render();
    this.updateUI();

    requestAnimationFrame((t) => this.loop(t));
  }

  private updateUI(): void {
    const { clock, weather } = this.world;
    const plants = this.world.flora.countPlants();
    const fauna = this.world.fauna.getStats();
    const weatherIcon = weather.isRaining ? '\u{1F327}\uFE0F' : '\u2600\uFE0F';
    const weatherLabel = weather.isRaining
      ? `Rain ${Math.floor(weather.rainIntensity * 100)}%`
      : 'Clear';
    const pauseLabel = this.paused ? ' [PAUSED]' : '';

    // Feed pop graph
    this.popGraph.sample(fauna.herbivores, fauna.predators, plants.tree);

    this.uiEl.innerHTML = `
      <div>${clock.formatDate()}</div>
      <div>${clock.formatTime()} ${weatherIcon} ${weatherLabel}${pauseLabel}</div>
      <div style="margin-top:8px;font-size:11px;color:#888">
        \u{1F33F} ${plants.grass}
        \u{1F338} ${plants.flower}
        \u{1F33F} ${plants.bush}
        \u{1F332} ${plants.tree}
      </div>
      <div style="margin-top:4px;font-size:11px;color:#8ab">
        \u{1F407} ${fauna.herbivores}
        \u{1F43A} ${fauna.predators}
        &middot; gen ${fauna.maxGeneration}
      </div>
    `;
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2_147_483_647);
}

new DriftApp();
