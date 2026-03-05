import { World, WORLD_SIZE } from './world/World';
import { Renderer3D } from './render3d/Renderer3D';
import { PopulationGraph } from './render/PopulationGraph';
import { InspectorPanel } from './render/InspectorPanel';
import { JournalPanel } from './render/JournalPanel';
import { SaveManager } from './persistence/SaveManager';
import { TimeWarp, TimeWarpResult } from './persistence/TimeWarp';
import { AmbientAudio } from './audio/AmbientAudio';

const SPEED_OPTIONS = [1, 2, 5, 10] as const;

class DriftApp {
  private world!: World;
  private renderer!: Renderer3D;
  private canvas!: HTMLCanvasElement;
  private saveManager = new SaveManager();
  private timeWarp = new TimeWarp();
  private popGraph!: PopulationGraph;
  private inspector!: InspectorPanel;
  private journalPanel!: JournalPanel;

  private paused = false;
  private tickAccumulator = 0;
  private lastFrameTime = 0;
  private speedIndex = 0;
  private audio = new AmbientAudio();
  private muted = false;

  private uiEl!: HTMLElement;
  private timeWarpEl!: HTMLElement;

  constructor() {
    this.canvas = document.getElementById('canvas') as HTMLCanvasElement;
    this.uiEl = document.getElementById('ui')!;
    this.timeWarpEl = document.getElementById('time-warp')!;

    this.renderer = new Renderer3D(this.canvas);
    this.popGraph = new PopulationGraph();
    this.inspector = new InspectorPanel();
    this.journalPanel = new JournalPanel();

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

    this.renderer.initWorld(this.world);
    this.renderer.attach(this.canvas);
    this.setupControls();
    this.setupAutoSave();

    this.lastFrameTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private setupControls(): void {
    // Init audio on first user interaction (autoplay policy)
    const initAudio = () => {
      this.audio.init();
      document.removeEventListener('click', initAudio);
      document.removeEventListener('keydown', initAudio);
    };
    document.addEventListener('click', initAudio);
    document.addEventListener('keydown', initAudio);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'p' || e.key === 'P') {
        this.paused = !this.paused;
      }
      if (e.key === 'r' || e.key === 'R') {
        if (confirm('Create a new world? The current one will be lost.')) {
          this.saveManager.clear();
          this.world = new World(randomSeed());
          this.renderer.initWorld(this.world);
          this.inspector.deselect();
          this.popGraph.clearHistory();
        }
      }
      if (e.key === 'j' || e.key === 'J') {
        this.journalPanel.toggle();
      }
      if (e.key === 'f' || e.key === 'F') {
        this.inspector.toggleFollow();
      }
      if (e.key === '>' || e.key === '.') {
        this.speedIndex = Math.min(this.speedIndex + 1, SPEED_OPTIONS.length - 1);
      }
      if (e.key === '<' || e.key === ',') {
        this.speedIndex = Math.max(this.speedIndex - 1, 0);
      }
      if (e.key === 'Escape') {
        this.inspector.deselect();
      }
      if (e.key === 'm' || e.key === 'M') {
        this.muted = !this.muted;
      }
    });

    // Click to select creature
    this.canvas.addEventListener('click', (e) => {
      const creature = this.renderer.findCreatureAt(
        e.clientX,
        e.clientY,
        this.world,
      );
      if (creature) {
        this.inspector.select(creature);
      } else {
        this.inspector.deselect();
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

  private get tickRate(): number {
    return 5 * SPEED_OPTIONS[this.speedIndex];
  }

  private loop(time: number): void {
    const dt = (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;

    if (!this.paused) {
      this.tickAccumulator += dt;
      const interval = 1 / this.tickRate;
      // Cap ticks per frame to avoid spiral of death
      const maxTicksPerFrame = Math.min(this.tickRate, 50);
      let ticks = 0;
      while (this.tickAccumulator >= interval && ticks < maxTicksPerFrame) {
        this.world.tick();
        this.tickAccumulator -= interval;
        ticks++;
      }
      if (this.tickAccumulator > interval * 2) {
        this.tickAccumulator = 0;
      }
    }

    // Follow selected creature (3D camera)
    const sel = this.inspector.selectedCreature;
    if (this.inspector.isFollowing && sel && sel.isAlive) {
      this.renderer.lookAt(sel.x, sel.y, this.world.terrain);
    }

    const selectedId = sel?.id ?? -1;
    this.renderer.render(this.world, selectedId);
    this.inspector.render();
    this.journalPanel.render(this.world.journal, this.world.clock);
    this.popGraph.render();
    this.updateUI();

    // Update ambient audio
    const { clock, weather } = this.world;
    const windMag = Math.sqrt(weather.windX * weather.windX + weather.windY * weather.windY);
    this.audio.update({
      daylight: clock.daylight,
      hour: clock.hour,
      season: clock.season,
      isRaining: weather.isRaining,
      rainIntensity: weather.rainIntensity,
      windStrength: Math.min(windMag / 0.5, 1),
      paused: this.paused || this.muted,
    }, dt);

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
    const speedLabel = SPEED_OPTIONS[this.speedIndex] > 1
      ? ` ${SPEED_OPTIONS[this.speedIndex]}x`
      : '';

    // Feed pop graph
    this.popGraph.sample(fauna.herbivores, fauna.predators, plants.tree);

    this.uiEl.innerHTML = `
      <div>${clock.formatDate()}</div>
      <div>${clock.formatTime()} ${weatherIcon} ${weatherLabel}${pauseLabel}${speedLabel}</div>
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
