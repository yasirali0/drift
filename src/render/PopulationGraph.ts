const MAX_HISTORY = 200;

interface Sample {
  herbivores: number;
  predators: number;
  trees: number;
}

export class PopulationGraph {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private history: Sample[] = [];
  private tickCounter = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'pop-graph';
    this.canvas.width = 220;
    this.canvas.height = 80;
    Object.assign(this.canvas.style, {
      position: 'absolute',
      bottom: '40px',
      right: '16px',
      background: 'rgba(0, 0, 0, 0.6)',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.08)',
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  sample(herbivores: number, predators: number, trees: number): void {
    this.tickCounter++;
    if (this.tickCounter % 10 !== 0) return;

    this.history.push({ herbivores, predators, trees });
    if (this.history.length > MAX_HISTORY) {
      this.history.shift();
    }
  }

  render(): void {
    const { ctx, canvas } = this;
    const w = canvas.width;
    const h = canvas.height;
    const pad = 4;
    const graphW = w - pad * 2;
    const graphH = h - pad * 2 - 12;

    ctx.clearRect(0, 0, w, h);

    if (this.history.length < 2) return;

    // Find max for scaling
    let maxVal = 1;
    for (const s of this.history) {
      maxVal = Math.max(maxVal, s.herbivores, s.predators, s.trees / 4);
    }

    // Labels
    ctx.font = '9px monospace';

    // Draw lines
    this.drawLine(pad, pad, graphW, graphH, maxVal, (s) => s.herbivores, 'rgba(120,200,130,0.8)');
    this.drawLine(pad, pad, graphW, graphH, maxVal, (s) => s.predators, 'rgba(220,100,80,0.8)');
    this.drawLine(pad, pad, graphW, graphH, maxVal, (s) => s.trees / 4, 'rgba(80,160,80,0.35)');

    // Legend
    const legendY = h - 6;
    ctx.fillStyle = 'rgba(120,200,130,0.9)';
    ctx.fillText('\u25CF prey', pad, legendY);
    ctx.fillStyle = 'rgba(220,100,80,0.9)';
    ctx.fillText('\u25CF pred', pad + 55, legendY);
    ctx.fillStyle = 'rgba(80,160,80,0.5)';
    ctx.fillText('\u25CF trees', pad + 115, legendY);
  }

  private drawLine(
    padX: number,
    padY: number,
    graphW: number,
    graphH: number,
    maxVal: number,
    getter: (s: Sample) => number,
    color: string,
  ): void {
    const { ctx, history } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < history.length; i++) {
      const x = padX + (i / (MAX_HISTORY - 1)) * graphW;
      const val = getter(history[i]);
      const y = padY + graphH - (val / maxVal) * graphH;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  clearHistory(): void {
    this.history = [];
  }
}
