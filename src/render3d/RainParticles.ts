import * as THREE from 'three';

const MAX_DROPS = 3000;

/**
 * Rain as a particle system — thin vertical streaks falling from the sky.
 * Wind pushes them sideways. Only active when it's raining.
 */
export class RainParticles {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly velocities: Float32Array;
  private readonly material: THREE.PointsMaterial;
  private active = false;
  private worldSize: number;

  constructor(scene: THREE.Scene, worldSize: number) {
    this.worldSize = worldSize;
    this.positions = new Float32Array(MAX_DROPS * 3);
    this.velocities = new Float32Array(MAX_DROPS * 3);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));

    this.material = new THREE.PointsMaterial({
      color: 0x99bbdd,
      size: 0.6,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);

    // Initialize random positions
    for (let i = 0; i < MAX_DROPS; i++) {
      this.resetDrop(i);
    }
  }

  private resetDrop(i: number): void {
    const i3 = i * 3;
    this.positions[i3] = Math.random() * this.worldSize;
    this.positions[i3 + 1] = 20 + Math.random() * 40;
    this.positions[i3 + 2] = Math.random() * this.worldSize;
    this.velocities[i3] = 0;
    this.velocities[i3 + 1] = -(8 + Math.random() * 12);
    this.velocities[i3 + 2] = 0;
  }

  update(
    dt: number,
    isRaining: boolean,
    rainIntensity: number,
    windX: number,
    windY: number,
    cameraTarget: THREE.Vector3,
  ): void {
    this.active = isRaining;
    this.points.visible = isRaining;
    if (!isRaining) return;

    const count = Math.floor(rainIntensity * MAX_DROPS);
    this.material.opacity = 0.2 + rainIntensity * 0.3;

    // Rain falls near the camera
    const spread = 80;

    for (let i = 0; i < MAX_DROPS; i++) {
      const i3 = i * 3;

      if (i >= count) {
        // Hide unused drops below ground
        this.positions[i3 + 1] = -100;
        continue;
      }

      // Apply velocity + wind
      this.positions[i3] += (this.velocities[i3] + windX * 4) * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += (this.velocities[i3 + 2] + windY * 4) * dt;

      // Reset when hitting ground or too far from camera
      if (this.positions[i3 + 1] < 0) {
        this.positions[i3] = cameraTarget.x + (Math.random() - 0.5) * spread;
        this.positions[i3 + 1] = 25 + Math.random() * 35;
        this.positions[i3 + 2] = cameraTarget.z + (Math.random() - 0.5) * spread;
      }
    }

    const attr = this.points.geometry.attributes.position;
    (attr as THREE.Float32BufferAttribute).needsUpdate = true;
  }
}
