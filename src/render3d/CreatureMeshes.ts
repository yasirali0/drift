import * as THREE from 'three';
import { Creature, Diet, CreatureState } from '../life/Creature';
import { Terrain } from '../world/Terrain';
import { TerrainMesh } from './TerrainMesh';

const MAX_INSTANCES = 700; // Slightly above MAX_CREATURES

/**
 * Renders all creatures as instanced meshes for performance.
 * Herbivores = spheres, Predators = cones (pointed in movement direction).
 * A selection ring highlights the picked creature.
 */
export class CreatureMeshes {
  readonly herbGroup: THREE.InstancedMesh;
  readonly predGroup: THREE.InstancedMesh;
  readonly selectionRing: THREE.Mesh;

  private herbCount = 0;
  private predCount = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly herbColor = new THREE.Color();
  private readonly predColor = new THREE.Color();

  /** Maps instance index → creature.id for raycasting picks. */
  herbIds: number[] = [];
  predIds: number[] = [];

  constructor(scene: THREE.Scene) {
    // Herbivore geometry — sphere
    const herbGeo = new THREE.SphereGeometry(1.2, 10, 8);
    const herbMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 20 });
    this.herbGroup = new THREE.InstancedMesh(herbGeo, herbMat, MAX_INSTANCES);
    this.herbGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.herbGroup.frustumCulled = false;
    scene.add(this.herbGroup);

    // Predator geometry — cone pointed forward
    const predGeo = new THREE.ConeGeometry(1.0, 2.5, 8);
    predGeo.rotateZ(-Math.PI / 2); // point along +X
    const predMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 20 });
    this.predGroup = new THREE.InstancedMesh(predGeo, predMat, MAX_INSTANCES);
    this.predGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.predGroup.frustumCulled = false;
    scene.add(this.predGroup);

    // Selection ring
    const ringGeo = new THREE.RingGeometry(2.5, 3.0, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x99ccff,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.selectionRing = new THREE.Mesh(ringGeo, ringMat);
    this.selectionRing.visible = false;
    scene.add(this.selectionRing);
  }

  update(
    creatures: Creature[],
    terrain: Terrain,
    terrainMesh: TerrainMesh,
    daylight: number,
    selectedId: number,
    frameTick: number,
  ): void {
    this.herbCount = 0;
    this.predCount = 0;
    this.herbIds = [];
    this.predIds = [];

    let selectionTarget: THREE.Vector3 | null = null;

    for (const c of creatures) {
      if (!c.isAlive) continue;

      const pos = terrainMesh.worldToSurface(c.x, c.y, terrain);
      const g = c.genes;
      const scale = 0.8 + g.size * 1.0;
      const d = 0.6 + daylight * 0.4;

      if (c.diet === Diet.HERBIVORE) {
        const idx = this.herbCount++;
        if (idx >= MAX_INSTANCES) continue;

        this.dummy.position.copy(pos);
        this.dummy.scale.setScalar(scale);
        this.dummy.updateMatrix();
        this.herbGroup.setMatrixAt(idx, this.dummy.matrix);

        const r = ((60 + g.colorR * 80) / 255) * d;
        const gC = ((130 + g.colorG * 100) / 255) * d;
        const b = ((50 + g.colorB * 80) / 255) * d;
        this.herbColor.setRGB(r, gC, b);
        this.herbGroup.setColorAt(idx, this.herbColor);
        this.herbIds.push(c.id);
      } else {
        const idx = this.predCount++;
        if (idx >= MAX_INSTANCES) continue;

        this.dummy.position.copy(pos);
        this.dummy.scale.setScalar(scale);
        // Rotate cone to face movement direction
        const angle = Math.atan2(c.dy, c.dx);
        this.dummy.rotation.set(0, -angle + Math.PI / 2, 0);
        this.dummy.updateMatrix();
        this.predGroup.setMatrixAt(idx, this.dummy.matrix);

        const r = ((140 + g.colorR * 115) / 255) * d;
        const gC = ((30 + g.colorG * 60) / 255) * d;
        const b = ((20 + g.colorB * 50) / 255) * d;
        this.predColor.setRGB(r, gC, b);
        this.predGroup.setColorAt(idx, this.predColor);
        this.predIds.push(c.id);
      }

      if (c.id === selectedId) {
        selectionTarget = pos;
      }
    }

    this.herbGroup.count = this.herbCount;
    this.predGroup.count = this.predCount;
    this.herbGroup.instanceMatrix.needsUpdate = true;
    this.predGroup.instanceMatrix.needsUpdate = true;
    if (this.herbGroup.instanceColor) this.herbGroup.instanceColor.needsUpdate = true;
    if (this.predGroup.instanceColor) this.predGroup.instanceColor.needsUpdate = true;

    // Selection ring
    if (selectionTarget) {
      this.selectionRing.visible = true;
      this.selectionRing.position.copy(selectionTarget);
      this.selectionRing.position.y += 0.05;
      const pulse = 1.0 + Math.sin(frameTick * 0.08) * 0.15;
      this.selectionRing.scale.setScalar(pulse);
      const mat = this.selectionRing.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.4 + Math.sin(frameTick * 0.1) * 0.2;
    } else {
      this.selectionRing.visible = false;
    }
  }
}
