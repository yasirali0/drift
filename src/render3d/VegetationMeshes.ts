import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Flora, PlantType, GrowthStage } from '../life/Flora';
import { Terrain, Biome } from '../world/Terrain';
import { HEIGHT_SCALE } from './TerrainMesh';

const MAX_TREES = 10000;
const MAX_BUSHES = 7000;
const MAX_GRASS = 12000;
const MAX_FLOWERS = 6000;

/**
 * Instanced 3D vegetation for all four plant types:
 *  - Trees: trunk cylinder + cone canopy
 *  - Bushes: dome cluster (merged spheres) with seasonal colours
 *  - Grass: small vertical blade clusters
 *  - Flowers: thin stem + coloured petal sphere on top
 */
export class VegetationMeshes {
  readonly treeGroup: THREE.Group;
  private trunkMesh: THREE.InstancedMesh;
  private canopyMesh: THREE.InstancedMesh;
  private bushMesh: THREE.InstancedMesh;
  private grassMesh: THREE.InstancedMesh;
  private flowerStemMesh: THREE.InstancedMesh;
  private flowerHeadMesh: THREE.InstancedMesh;

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

    // Bush — cluster of merged spheres for a fuller look
    const bushGeo = this.buildBushGeo();
    const bushMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 8 });
    this.bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, MAX_BUSHES);
    this.bushMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bushMesh.frustumCulled = false;
    this.bushMesh.castShadow = true;
    this.treeGroup.add(this.bushMesh);

    // Grass — small blade clusters (thin cones)
    const grassGeo = this.buildGrassGeo();
    const grassMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 3 });
    this.grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, MAX_GRASS);
    this.grassMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.grassMesh.frustumCulled = false;
    this.treeGroup.add(this.grassMesh);

    // Flower stem — thin cylinder
    const stemGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.8, 4);
    stemGeo.translate(0, 0.4, 0);
    const stemMat = new THREE.MeshPhongMaterial({ color: 0x4a7a2e, shininess: 3 });
    this.flowerStemMesh = new THREE.InstancedMesh(stemGeo, stemMat, MAX_FLOWERS);
    this.flowerStemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flowerStemMesh.frustumCulled = false;
    this.treeGroup.add(this.flowerStemMesh);

    // Flower head — small sphere on top
    const headGeo = new THREE.SphereGeometry(0.18, 5, 4);
    headGeo.translate(0, 0.9, 0);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 15 });
    this.flowerHeadMesh = new THREE.InstancedMesh(headGeo, headMat, MAX_FLOWERS);
    this.flowerHeadMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flowerHeadMesh.frustumCulled = false;
    this.treeGroup.add(this.flowerHeadMesh);

    scene.add(this.treeGroup);
  }

  private buildBushGeo(): THREE.BufferGeometry {
    // Several overlapping spheres for a hedge-like cluster
    const c = new THREE.SphereGeometry(0.6, 5, 4);
    c.translate(0, 0.5, 0);
    const l = new THREE.SphereGeometry(0.45, 5, 4);
    l.translate(-0.35, 0.4, 0.2);
    const r = new THREE.SphereGeometry(0.45, 5, 4);
    r.translate(0.35, 0.4, -0.2);
    const t = new THREE.SphereGeometry(0.35, 5, 4);
    t.translate(0, 0.85, 0);
    const merged = mergeGeometries([c, l, r, t]);
    merged.computeVertexNormals();
    return merged;
  }

  private buildGrassGeo(): THREE.BufferGeometry {
    // Cluster of 3 thin cones as grass blades
    const blade = (ox: number, oz: number, rot: number) => {
      const g = new THREE.ConeGeometry(0.08, 0.6, 3);
      g.rotateY(rot);
      g.translate(ox, 0.3, oz);
      return g;
    };
    const merged = mergeGeometries([
      blade(0, 0, 0),
      blade(0.12, 0.08, 0.8),
      blade(-0.1, 0.06, 1.6),
    ]);
    merged.computeVertexNormals();
    return merged;
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
    let grassCount = 0;
    let flowerCount = 0;

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
        const d = 0.5 + daylight * 0.5;

        if (ptype === PlantType.TREE && treeCount < MAX_TREES) {
          const ti = treeCount++;
          const maturity = stage >= GrowthStage.MATURE ? 1.0 : 0.6;
          const scale = 0.5 + maturity * 0.7;

          this.dummy.position.set(ix, y, iy);
          this.dummy.scale.set(scale, scale * (0.8 + maturity * 0.4), scale);
          this.dummy.rotation.set(0, (ix * 7 + iy * 13) % 6, 0);
          this.dummy.updateMatrix();
          this.trunkMesh.setMatrixAt(ti, this.dummy.matrix);
          this.canopyMesh.setMatrixAt(ti, this.dummy.matrix);

          if (season === 2) {
            this.tmpColor.setRGB(0.7 * d * maturity, 0.35 * d * maturity, 0.08 * d);
          } else if (season === 3) {
            this.tmpColor.setRGB(0.25 * d, 0.3 * d, 0.25 * d);
          } else {
            this.tmpColor.setRGB(0.1 * d, (0.35 + maturity * 0.2) * d, 0.1 * d);
          }
          this.canopyMesh.setColorAt(ti, this.tmpColor);

          this.tmpColor.setRGB(0.35 * d, 0.22 * d, 0.08 * d);
          this.trunkMesh.setColorAt(ti, this.tmpColor);

        } else if (ptype === PlantType.BUSH && bushCount < MAX_BUSHES) {
          const bi = bushCount++;
          const maturity = stage >= GrowthStage.MATURE ? 1.0 : 0.7;
          const scale = 0.6 + maturity * 0.6;

          this.dummy.position.set(ix, y, iy);
          this.dummy.scale.setScalar(scale);
          this.dummy.rotation.set(0, (ix * 3 + iy * 11) % 6, 0);
          this.dummy.updateMatrix();
          this.bushMesh.setMatrixAt(bi, this.dummy.matrix);

          if (season === 2) {
            this.tmpColor.setRGB(0.55 * d, 0.35 * d, 0.1 * d);
          } else if (season === 3) {
            this.tmpColor.setRGB(0.2 * d, 0.25 * d, 0.18 * d);
          } else {
            this.tmpColor.setRGB(0.15 * d, (0.35 + maturity * 0.15) * d, 0.12 * d);
          }
          this.bushMesh.setColorAt(bi, this.tmpColor);

        } else if (ptype === PlantType.GRASS && grassCount < MAX_GRASS) {
          const gi = grassCount++;
          const maturity = stage >= GrowthStage.MATURE ? 1.0 : 0.6;
          const scale = 0.5 + maturity * 0.6;

          this.dummy.position.set(ix, y, iy);
          this.dummy.scale.setScalar(scale);
          this.dummy.rotation.set(0, (ix * 5 + iy * 9) % 6, 0);
          this.dummy.updateMatrix();
          this.grassMesh.setMatrixAt(gi, this.dummy.matrix);

          if (season === 2) {
            this.tmpColor.setRGB(0.5 * d, 0.4 * d, 0.15 * d);
          } else if (season === 3) {
            this.tmpColor.setRGB(0.35 * d, 0.35 * d, 0.2 * d);
          } else {
            this.tmpColor.setRGB(0.2 * d, (0.5 + maturity * 0.15) * d, 0.12 * d);
          }
          this.grassMesh.setColorAt(gi, this.tmpColor);

        } else if (ptype === PlantType.FLOWER && flowerCount < MAX_FLOWERS) {
          const fi = flowerCount++;
          const scale = 0.7 + (stage >= GrowthStage.MATURE ? 0.5 : 0.2);

          this.dummy.position.set(ix, y, iy);
          this.dummy.scale.setScalar(scale);
          this.dummy.rotation.set(0, (ix * 11 + iy * 7) % 6, 0);
          this.dummy.updateMatrix();
          this.flowerStemMesh.setMatrixAt(fi, this.dummy.matrix);
          this.flowerHeadMesh.setMatrixAt(fi, this.dummy.matrix);

          // Flower colour varies by position — creates a meadow of different colours
          const hue = ((ix * 17 + iy * 31) % 100) / 100;
          if (season === 3) {
            // Winter: faded flowers
            this.tmpColor.setRGB(0.3 * d, 0.28 * d, 0.2 * d);
          } else if (hue < 0.25) {
            // Yellow
            this.tmpColor.setRGB(0.9 * d, 0.8 * d, 0.15 * d);
          } else if (hue < 0.5) {
            // Pink/magenta
            this.tmpColor.setRGB(0.85 * d, 0.25 * d, 0.5 * d);
          } else if (hue < 0.75) {
            // White
            this.tmpColor.setRGB(0.9 * d, 0.9 * d, 0.85 * d);
          } else {
            // Purple/blue
            this.tmpColor.setRGB(0.5 * d, 0.25 * d, 0.8 * d);
          }
          this.flowerHeadMesh.setColorAt(fi, this.tmpColor);
        }
      }
    }

    this.trunkMesh.count = treeCount;
    this.canopyMesh.count = treeCount;
    this.bushMesh.count = bushCount;
    this.grassMesh.count = grassCount;
    this.flowerStemMesh.count = flowerCount;
    this.flowerHeadMesh.count = flowerCount;

    this.trunkMesh.instanceMatrix.needsUpdate = true;
    this.canopyMesh.instanceMatrix.needsUpdate = true;
    this.bushMesh.instanceMatrix.needsUpdate = true;
    this.grassMesh.instanceMatrix.needsUpdate = true;
    this.flowerStemMesh.instanceMatrix.needsUpdate = true;
    this.flowerHeadMesh.instanceMatrix.needsUpdate = true;
    if (this.trunkMesh.instanceColor) this.trunkMesh.instanceColor.needsUpdate = true;
    if (this.canopyMesh.instanceColor) this.canopyMesh.instanceColor.needsUpdate = true;
    if (this.bushMesh.instanceColor) this.bushMesh.instanceColor.needsUpdate = true;
    if (this.grassMesh.instanceColor) this.grassMesh.instanceColor.needsUpdate = true;
    if (this.flowerHeadMesh.instanceColor) this.flowerHeadMesh.instanceColor.needsUpdate = true;
  }
}
