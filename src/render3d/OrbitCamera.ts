import * as THREE from 'three';

/**
 * Orbit-style camera that rotates around a target point on the terrain.
 * Supports mouse drag to orbit, scroll to zoom, and programmatic lookAt.
 */
export class OrbitCamera {
  readonly camera: THREE.PerspectiveCamera;

  // Spherical coordinates around target
  private theta = Math.PI * 0.25; // azimuthal angle
  private phi = Math.PI * 0.3; // polar angle (from top)
  private radius = 120;

  private targetTheta = this.theta;
  private targetPhi = this.phi;
  private targetRadius = this.radius;

  // World point to orbit around
  private target = new THREE.Vector3(128, 0, 128);
  private targetTarget = new THREE.Vector3(128, 0, 128);

  get orbitTarget(): THREE.Vector3 {
    return this.target;
  }

  private isDragging = false;
  private isRightDragging = false;
  private lastMouse = { x: 0, y: 0 };

  private readonly MIN_RADIUS = 20;
  private readonly MAX_RADIUS = 400;
  private readonly MIN_PHI = 0.1;
  private readonly MAX_PHI = Math.PI * 0.48;

  constructor(worldSize: number) {
    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 1200);
    this.target.set(worldSize / 2, 0, worldSize / 2);
    this.targetTarget.copy(this.target);
    this.updateCameraPosition();
  }

  attach(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.isDragging = true;
      } else if (e.button === 2) {
        this.isRightDragging = true;
      }
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;
    });

    canvas.addEventListener('mousemove', (e) => {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;
      this.lastMouse.x = e.clientX;
      this.lastMouse.y = e.clientY;

      if (this.isDragging) {
        // Orbit
        this.targetTheta -= dx * 0.005;
        this.targetPhi = Math.max(
          this.MIN_PHI,
          Math.min(this.MAX_PHI, this.targetPhi - dy * 0.005),
        );
      } else if (this.isRightDragging) {
        // Pan
        const panSpeed = this.radius * 0.003;
        const right = new THREE.Vector3();
        right.setFromMatrixColumn(this.camera.matrixWorld, 0);
        right.y = 0;
        right.normalize();
        const forward = new THREE.Vector3();
        forward.crossVectors(new THREE.Vector3(0, 1, 0), right).normalize();
        this.targetTarget.addScaledVector(right, -dx * panSpeed);
        this.targetTarget.addScaledVector(forward, dy * panSpeed);
      }
    });

    const onUp = () => {
      this.isDragging = false;
      this.isRightDragging = false;
    };
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1.08 : 0.92;
        this.targetRadius = Math.max(
          this.MIN_RADIUS,
          Math.min(this.MAX_RADIUS, this.targetRadius * factor),
        );
      },
      { passive: false },
    );

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
    });
  }

  /** Smoothly pan to look at a world coordinate. */
  lookAt(wx: number, wy: number, surfaceY: number = 0): void {
    this.targetTarget.set(wx, surfaceY, wy);
  }

  update(): void {
    const t = 0.08;
    this.theta += (this.targetTheta - this.theta) * t;
    this.phi += (this.targetPhi - this.phi) * t;
    this.radius += (this.targetRadius - this.radius) * t;
    this.target.lerp(this.targetTarget, t);

    this.updateCameraPosition();
  }

  private updateCameraPosition(): void {
    const x = this.target.x + this.radius * Math.sin(this.phi) * Math.cos(this.theta);
    const y = this.target.y + this.radius * Math.cos(this.phi);
    const z = this.target.z + this.radius * Math.sin(this.phi) * Math.sin(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}
