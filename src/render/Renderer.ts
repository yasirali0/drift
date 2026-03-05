import { World } from '../world/World';
import { Camera } from './Camera';
import {
  BIOME_COLORS,
  getPlantColor,
  applyDaylight,
  applyRain,
  RGB,
} from './Colors';
import { PlantType } from '../life/Flora';
import { Creature, Diet, CreatureState } from '../life/Creature';

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Off-screen buffer for the world
  private worldCanvas: HTMLCanvasElement;
  private worldCtx: CanvasRenderingContext2D;
  private imageData: ImageData;

  private rainSeed = 0;
  private frameTick = 0;

  constructor(canvas: HTMLCanvasElement, worldSize: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;

    this.worldCanvas = document.createElement('canvas');
    this.worldCanvas.width = worldSize;
    this.worldCanvas.height = worldSize;
    this.worldCtx = this.worldCanvas.getContext('2d')!;
    this.imageData = this.worldCtx.createImageData(worldSize, worldSize);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.ctx.imageSmoothingEnabled = false;
  }

  render(world: World, camera: Camera, selectedId: number = -1): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const size = world.terrain.size;
    const daylight = world.clock.daylight;
    const season = world.clock.season;
    const isRaining = world.weather.isRaining;
    const rainIntensity = world.weather.rainIntensity;
    const data = this.imageData.data;
    this.frameTick++;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pi = (y * size + x) * 4;

        const biome = world.terrain.getBiome(x, y);
        let color: RGB = [...BIOME_COLORS[biome]] as RGB;

        // Height shading
        const height = world.terrain.getHeight(x, y);
        const shade = 0.85 + height * 0.3;

        // Ocean shimmer
        if (biome <= 1) {
          const shimmer = Math.sin((x + this.frameTick * 0.3) * 0.2) *
            Math.cos((y + this.frameTick * 0.2) * 0.15) * 12;
          color[2] = Math.min(255, color[2] + shimmer);
        }
        color[0] = Math.floor(color[0] * shade);
        color[1] = Math.floor(color[1] * shade);
        color[2] = Math.floor(color[2] * shade);

        // Water overlay
        const waterLevel = world.water.getLevel(x, y);
        if (waterLevel > 0.005) {
          const a = Math.min(0.85, waterLevel * 3);
          color[0] = Math.floor(color[0] * (1 - a) + 30 * a);
          color[1] = Math.floor(color[1] * (1 - a) + 70 * a);
          color[2] = Math.floor(color[2] * (1 - a) + 170 * a);
        }

        // Plant overlay
        const plantType = world.flora.getType(x, y);
        if (plantType !== PlantType.NONE) {
          const pc = getPlantColor(
            plantType,
            world.flora.getStage(x, y),
            season,
          );
          if (pc) color = pc;
        }

        // Lighting
        color = applyDaylight(color, daylight);
        if (isRaining) color = applyRain(color, rainIntensity);

        data[pi] = Math.min(255, Math.max(0, color[0]));
        data[pi + 1] = Math.min(255, Math.max(0, color[1]));
        data[pi + 2] = Math.min(255, Math.max(0, color[2]));
        data[pi + 3] = 255;
      }
    }

    this.worldCtx.putImageData(this.imageData, 0, 0);

    // Clear main canvas
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);

    // Draw world scaled through camera
    const zoom = camera.zoom;
    const drawW = size * zoom;
    const drawH = size * zoom;
    const drawX = w / 2 - camera.x * zoom;
    const drawY = h / 2 - camera.y * zoom;
    ctx.drawImage(this.worldCanvas, drawX, drawY, drawW, drawH);

    // Creatures
    this.renderCreatures(world, camera, w, h, selectedId);

    // Rain
    if (isRaining) {
      this.renderRain(w, h, rainIntensity, world.weather.windX);
    }
  }

  private renderRain(
    w: number,
    h: number,
    intensity: number,
    windX: number,
  ): void {
    this.rainSeed++;
    const ctx = this.ctx;
    ctx.strokeStyle = `rgba(150,180,220,${intensity * 0.25})`;
    ctx.lineWidth = 1;
    const count = Math.floor(intensity * 150);

    // Deterministic-ish rain based on frame counter
    let seed = this.rainSeed;
    for (let i = 0; i < count; i++) {
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff) >>> 0;
      const rx = (seed % w);
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff) >>> 0;
      const ry = (seed % h);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + windX * 5, ry + 8);
      ctx.stroke();
    }
  }

  private renderCreatures(
    world: World,
    camera: Camera,
    canvasW: number,
    canvasH: number,
    selectedId: number,
  ): void {
    const ctx = this.ctx;
    const zoom = camera.zoom;
    const daylight = world.clock.daylight;

    for (const creature of world.fauna.creatures) {
      if (!creature.isAlive) continue;

      const [sx, sy] = camera.worldToScreen(
        creature.x,
        creature.y,
        canvasW,
        canvasH,
      );

      // Cull off-screen
      if (sx < -10 || sx > canvasW + 10 || sy < -10 || sy > canvasH + 10) continue;

      const size = Math.max(2, (1 + creature.genes.size * 2) * Math.min(zoom, 6));
      const g = creature.genes;

      let r: number, gCol: number, b: number;
      if (creature.diet === Diet.PREDATOR) {
        r = 140 + g.colorR * 115;
        gCol = 30 + g.colorG * 60;
        b = 20 + g.colorB * 50;
      } else {
        r = 60 + g.colorR * 80;
        gCol = 130 + g.colorG * 100;
        b = 50 + g.colorB * 80;
      }

      // Dim at night
      r *= (0.4 + daylight * 0.6);
      gCol *= (0.4 + daylight * 0.6);
      b *= (0.4 + daylight * 0.6);

      ctx.fillStyle = `rgb(${Math.floor(r)},${Math.floor(gCol)},${Math.floor(b)})`;

      // Shape: predators are triangular, herbivores are round
      if (creature.diet === Diet.PREDATOR) {
        const angle = Math.atan2(creature.dy, creature.dx);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(size, 0);
        ctx.lineTo(-size * 0.6, -size * 0.5);
        ctx.lineTo(-size * 0.6, size * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // State indicator when zoomed in
      if (zoom >= 4) {
        if (creature.state === CreatureState.FLEEING) {
          ctx.fillStyle = 'rgba(255,100,100,0.7)';
          ctx.font = `${Math.floor(size)}px monospace`;
          ctx.fillText('!', sx + size, sy - size);
        } else if (creature.state === CreatureState.HUNTING) {
          ctx.fillStyle = 'rgba(255,200,50,0.7)';
          ctx.font = `${Math.floor(size)}px monospace`;
          ctx.fillText('\u2694', sx + size, sy - size);
        }
      }

      // Selection ring
      if (creature.id === selectedId) {
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, size + 3, 0, Math.PI * 2);
        ctx.stroke();
        // Pulsing outer ring
        const pulse = 0.3 + Math.sin(this.frameTick * 0.1) * 0.2;
        ctx.strokeStyle = `rgba(150,200,255,${pulse})`;
        ctx.beginPath();
        ctx.arc(sx, sy, size + 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  findCreatureAt(
    screenX: number,
    screenY: number,
    world: World,
    camera: Camera,
  ): Creature | null {
    const w = this.canvas.width;
    const h = this.canvas.height;
    let best: Creature | null = null;
    let bestDist = 400; // 20px radius squared

    for (const creature of world.fauna.creatures) {
      if (!creature.isAlive) continue;
      const [sx, sy] = camera.worldToScreen(creature.x, creature.y, w, h);
      const dx = sx - screenX;
      const dy = sy - screenY;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        best = creature;
      }
    }

    return best;
  }
}
