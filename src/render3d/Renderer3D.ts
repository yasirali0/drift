import * as THREE from 'three';
import { World, WORLD_SIZE } from '../world/World';
import { TerrainMesh } from './TerrainMesh';
import { WaterPlane } from './WaterPlane';
import { SkyLighting } from './SkyLighting';
import { CreatureMeshes } from './CreatureMeshes';
import { VegetationMeshes } from './VegetationMeshes';
import { OrbitCamera } from './OrbitCamera';
import { RainParticles } from './RainParticles';
import { Creature } from '../life/Creature';
import { HEIGHT_SCALE } from './TerrainMesh';

export class Renderer3D {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private orbitCamera: OrbitCamera;

  private terrainMesh!: TerrainMesh;
  private waterPlane!: WaterPlane;
  private skyLighting!: SkyLighting;
  private creatureMeshes!: CreatureMeshes;
  private vegetation!: VegetationMeshes;
  private rain!: RainParticles;

  private frameTick = 0;
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();

  // Track the current world to know when to rebuild terrain mesh
  private currentSeed: number = -1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;

    this.scene = new THREE.Scene();
    this.orbitCamera = new OrbitCamera(WORLD_SIZE);

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  get camera(): OrbitCamera {
    return this.orbitCamera;
  }

  /** Called once when we know the world (or a new world). Builds scene objects. */
  initWorld(world: World): void {
    if (this.currentSeed === world.seed) return;
    this.currentSeed = world.seed;

    // Remove old meshes if rebuilding
    this.scene.clear();

    this.terrainMesh = new TerrainMesh(world.terrain);
    this.scene.add(this.terrainMesh.mesh);

    this.waterPlane = new WaterPlane(WORLD_SIZE);
    this.scene.add(this.waterPlane.mesh);

    this.skyLighting = new SkyLighting(this.scene, WORLD_SIZE);

    this.creatureMeshes = new CreatureMeshes(this.scene);

    this.vegetation = new VegetationMeshes(this.scene);

    this.rain = new RainParticles(this.scene, WORLD_SIZE);
  }

  attach(canvas: HTMLCanvasElement): void {
    this.orbitCamera.attach(canvas);
  }

  /** Render one frame. */
  render(world: World, selectedId: number = -1): void {
    this.frameTick++;
    const dt = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    const { clock, weather } = world;
    const daylight = clock.daylight;
    const isRaining = weather.isRaining;
    const rainIntensity = weather.rainIntensity;

    // Update terrain vertex colors (skip heavy full updates — do every 10 frames)
    if (this.frameTick % 10 === 0) {
      this.terrainMesh.update(
        world.terrain,
        world.flora,
        world.water,
        clock.season,
        daylight,
        isRaining,
        rainIntensity,
      );
    }

    // Update vegetation every 30 frames
    if (this.frameTick % 30 === 0) {
      this.vegetation.update(world.flora, world.terrain, clock.season, daylight);
    }

    // Water animation
    this.waterPlane.update(elapsed, daylight, weather.windX, weather.windY);

    // Sky & lighting
    this.skyLighting.update(this.scene, daylight, isRaining, rainIntensity, WORLD_SIZE, elapsed);

    // Creatures
    this.creatureMeshes.update(
      world.fauna.creatures,
      world.terrain,
      this.terrainMesh,
      daylight,
      selectedId,
      this.frameTick,
    );

    // Rain particles
    const camTarget = this.orbitCamera.orbitTarget;
    this.rain.update(dt, isRaining, rainIntensity, weather.windX, weather.windY, camTarget);

    // Camera
    this.orbitCamera.update();

    // Keep sky dome centered on camera
    this.skyLighting.skyDome.position.copy(this.orbitCamera.camera.position);

    this.renderer.render(this.scene, this.orbitCamera.camera);
  }

  /** Look at a world position (for follow mode). */
  lookAt(wx: number, wy: number, terrain: { getHeight(x: number, y: number): number }): void {
    const ix = Math.floor(Math.max(0, Math.min(wx, WORLD_SIZE - 1)));
    const iy = Math.floor(Math.max(0, Math.min(wy, WORLD_SIZE - 1)));
    const h = terrain.getHeight(ix, iy) * HEIGHT_SCALE;
    this.orbitCamera.lookAt(wx, wy, h);
  }

  /** Pick a creature by screen click coordinates. */
  findCreatureAt(
    screenX: number,
    screenY: number,
    world: World,
  ): Creature | null {
    // Normalize mouse coords
    this.mouse.x = (screenX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(screenY / window.innerHeight) * 2 + 1;

    this.raycaster.set(
      this.orbitCamera.camera.position.clone(),
      new THREE.Vector3(this.mouse.x, this.mouse.y, 0.5)
        .unproject(this.orbitCamera.camera)
        .sub(this.orbitCamera.camera.position)
        .normalize(),
    );

    // Pick against herbivore instances
    const herbHits = this.raycaster.intersectObject(this.creatureMeshes.herbGroup);
    if (herbHits.length > 0 && herbHits[0].instanceId !== undefined) {
      const id = this.creatureMeshes.herbIds[herbHits[0].instanceId];
      const creature = world.fauna.creatures.find((c) => c.id === id && c.isAlive);
      if (creature) return creature;
    }

    // Pick against predator instances
    const predHits = this.raycaster.intersectObject(this.creatureMeshes.predGroup);
    if (predHits.length > 0 && predHits[0].instanceId !== undefined) {
      const id = this.creatureMeshes.predIds[predHits[0].instanceId];
      const creature = world.fauna.creatures.find((c) => c.id === id && c.isAlive);
      if (creature) return creature;
    }

    return null;
  }
}
