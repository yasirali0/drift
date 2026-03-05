export class Camera {
  x: number;
  y: number;
  zoom: number;

  private targetX: number;
  private targetY: number;
  private targetZoom: number;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragCamStartX = 0;
  private dragCamStartY = 0;

  constructor(worldSize: number) {
    this.x = worldSize / 2;
    this.y = worldSize / 2;
    this.targetX = this.x;
    this.targetY = this.y;

    const initialZoom =
      (Math.min(window.innerWidth, window.innerHeight) / worldSize) * 0.8;
    this.zoom = initialZoom;
    this.targetZoom = initialZoom;
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.dragCamStartX = this.targetX;
      this.dragCamStartY = this.targetY;
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const dx = (e.clientX - this.dragStartX) / this.zoom;
      const dy = (e.clientY - this.dragStartY) / this.zoom;
      this.targetX = this.dragCamStartX - dx;
      this.targetY = this.dragCamStartY - dy;
    });

    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        this.targetZoom = Math.max(1, Math.min(20, this.targetZoom * factor));
      },
      { passive: false },
    );
  }

  update(): void {
    const t = 0.15;
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;
    this.zoom += (this.targetZoom - this.zoom) * t;
  }

  worldToScreen(
    wx: number,
    wy: number,
    canvasW: number,
    canvasH: number,
  ): [number, number] {
    return [
      (wx - this.x) * this.zoom + canvasW / 2,
      (wy - this.y) * this.zoom + canvasH / 2,
    ];
  }
}
