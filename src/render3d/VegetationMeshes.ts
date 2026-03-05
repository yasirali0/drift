import * as THREE from 'three';
import { Flora, PlantType, GrowthStage } from '../life/Flora';
import { Terrain, Biome } from '../world/Terrain';
import { HEIGHT_SCALE } from './TerrainMesh';

const MAX_TREES = 4000;
const MAX_BUSHES = 3000;

/**
 * Instanced 3D vegetation: trees as trunk+canopy, bushes as small spheres.
 * Updated every N frames from the Flora grid.
 */
export class VegetationMeshes {
  readonly treeGroup: THREE.Group;
  private trunkMesh: THREE.InstancedMesh;
  private canopyMesh: THREE.InstancedMesh;
  private bushMesh: THREE.InstancedMesh;

  private readonly dummy = new THREE.Object3D();
  private readonly tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.treeGroup = new THREE.Group();

    // Tree trunk — thin cylinder
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3.0, 5);
    trunkGeo.translate(0, 1.5, 0);
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x8B6914, shininess: 5 });
    this.trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, MAX_TREES);
    this.trunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.trunkMesh.frustumCulled = false;
    this.trunkMesh.castShadow = true;
    this.treeGroup.add(this.trunkMesh);

    // Tree canopy — cone (evergreen look)
    const canopyGeo = new THREE.ConeGeometry(2.0, 4.0, 6);
    canopyGeo.translate(0, 5.0, 0);
    const canopyMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8 });
    this.canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, MAX_TREES);
    this.canopyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.canopyMesh.frustumCulled = false;
    this.canopyMesh.castShadow = true;
    this.treeGroup.add(this.canopyMesh);

    // Bush — squashed sphere
    const bushGeo = new THREE.SphereGeometry(1.0, 6, 5);
    bushGeo.scale(1.0, 0.6, 1.0);
    bushGeo.translate(0, 0.5, 0);
    const bushMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8 });
    this.bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, MAX_BUSHES);
    this.bushMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bushMesh.frustumCulled = false;
    this.bushMesh.castShadow = true;
    this.treeGroup.add(this.bushMesh);

    scene.add(this.treeGroup);
  }

  update(
    flora: Flora,
    terrain: Terrain,
    season: number,
    daylight: number,
  ): void {
    const size = flora.size;
    let treeCount = 0;
    let bushCount = 0;

    // Sample every 2nd cell for performance
    for (let iy = 0; iy < size; iy += 2) {
      for (let ix = 0; ix < size; ix += 2) {
        const idx = iy * size + ix;
        const ptype = flora.type[idx];
        const stage = flora.stage[idx];
        if (ptype === PlantType.NONE || stage < GrowthStage.YOUNG) continue;

        const biome = terrain.getBiome(ix, iy);
        if (biome === Biome.WATER || biome === Biome.DEEP_WATER) continue;

        const h = terrain.height[idx];
        const y = h * HEIGHT_SCALE;

        if (ptype === PlantType.TREE && treeCount < MAX_TREES) {
          const ti = treeCount++;
          const maturity = stage >= GrowthStage.MATURE ? 1.0 : 0.6;
          const scale = 0.5 + maturity * 0.7;

          this.dummy.position.set(ix, y, iy);
          this.dummy.scale.set(scale, scale * (0.8 + maturity * 0.4), scale);
          this.dummy.rotation.set(0, (ix * 7 + iy * 13) % 6, 0); // pseudo-random rotation
          this.dummy.updateMatrix();
          this.trunkMesh.setMatrixAt(ti, this.dummy.matrix);
          this.canopyMesh.setMatrixAt(ti, this.dummy.matrix);

          // Canopy color by season
          const d = 0.5 + daylight * 0.5;
          if (season === 2) { // Autumn
            this.tmpColor.setRGB(0.7 * d * maturity, 0.35 * d * maturity, 0.08 * d);
          } else if (season === 3) { // Winter
            this.tmpColor.setRGB(0.25 * d, 0.3 * d, 0.25 * d);
          } else { // Spring/Summer
            this.tmpColor.setRGB(0.1 * d, (0.35 + maturity * 0.2) * d, 0.1 * d);
          }
          this.canopyMesh.setColorAt(ti, this.tmpColor);

          // Trunk color
          this.tmpColor.setRGB(0.35 * d, 0.22 * d, 0.08 * d);
          this.trunkMesh.setColorAt(ti, this.tmpColor);
        } else if (ptype === PlantType.BUSH && bushCount < MAX_BUSHES) {
          const bi = bushCount++;
          const maturity = stage >= GrowthStage.MATURE ? 1.0 : 0.7;
          const scale = 0.4 + maturity * 0.5;

          this.dummy.position.set(ix, y, iy);
          this.dummy.scale.setScalar(scale);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.updateMatrix();
          this.bushMesh.setMatrixAt(bi, this.dummy.matrix);

          const d = 0.5 + daylight * 0.5;
          if (season === 2) {
            this.tmpColor.setRGB(0.5 * d, 0.4 * d, 0.1 * d);
          } else {
            this.tmpColor.setRGB(0.12 * d, (0.3 + maturity * 0.15) * d, 0.1 * d);
          }
          this.bushMesh.setColorAt(bi, this.tmpColor);
        }
      }
    }

    this.trunkMesh.count = treeCount;
    this.canopyMesh.count = treeCount;
    this.bushMesh.count = bushCount;

    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.canopyMesh.instanceMatrix.needsUpdate = true;
    this.bushMesh.instanceMatrix.needsUpdate = true;
    if (this.trunkMesh.instanceColor) this.trunkMesh.instanceColor.needsUpdate = true;
    if (this.canopyMesh.instanceColor) this.canopyMesh.instanceColor.needsUpdate = true;
    if (this.bushMesh.instanceColor) this.bushMesh.instanceColor.needsUpdate = true;
  }
}
