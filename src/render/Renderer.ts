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

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Off-screen buffer for the world
  private worldCanvas: HTMLCanvasElement;
  private worldCtx: CanvasRenderingContext2D;
  private imageData: ImageData;

  private rainSeed = 0;

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

  render(world: World, camera: Camera): void {
    const { ctx } = this;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const size = world.terrain.size;
    const daylight = world.clock.daylight;
    const season = world.clock.season;
    const isRaining = world.weather.isRaining;
    const rainIntensity = world.weather.rainIntensity;
    const data = this.imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const pi = (y * size + x) * 4;

        const biome = world.terrain.getBiome(x, y);
        let color: RGB = [...BIOME_COLORS[biome]] as RGB;

        // Height shading
        const height = world.terrain.getHeight(x, y);
        const shade = 0.85 + height * 0.3;
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
}
