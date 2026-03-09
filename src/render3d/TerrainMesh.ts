import * as THREE from 'three';
import { Terrain, Biome } from '../world/Terrain';
import { Flora, PlantType, GrowthStage } from '../life/Flora';
import { Water } from '../world/Water';
import { BIOME_COLORS, getPlantColor, RGB } from '../render/Colors';

const HEIGHT_SCALE = 50;

export class TerrainMesh {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly colorAttr: THREE.Float32BufferAttribute;
  private readonly size: number;

  constructor(terrain: Terrain) {
    this.size = terrain.size;
    const s = this.size;

    this.geometry = new THREE.PlaneGeometry(s, s, s - 1, s - 1);
    this.geometry.rotateX(-Math.PI / 2);

    // Set heights
    const pos = this.geometry.attributes.position;
    for (let iy = 0; iy < s; iy++) {
      for (let ix = 0; ix < s; ix++) {
        const vi = iy * s + ix;
        const h = terrain.height[vi];
        pos.setY(vi, h * HEIGHT_SCALE);
      }
    }

    // Vertex colors
    const colors = new Float32Array(s * s * 3);
    this.colorAttr = new THREE.Float32BufferAttribute(colors, 3);
    this.geometry.setAttribute('color', this.colorAttr);

    this.geometry.computeVertexNormals();

    const material = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 3,
      flatShading: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    // Center the mesh so world coordinate (0,0) is at mesh corner
    this.mesh.position.set(this.size / 2 - 0.5, 0, this.size / 2 - 0.5);
  }

  /** Update vertex heights (for erosion) and colors (for biome/flora/lighting). */
  update(
    terrain: Terrain,
    flora: Flora,
    water: Water,
    season: number,
    daylight: number,
    isRaining: boolean,
    rainIntensity: number,
    heat?: Uint8Array,
  ): void {
    const s = this.size;
    const pos = this.geometry.attributes.position;
    const col = this.colorAttr;

    for (let iy = 0; iy < s; iy++) {
      for (let ix = 0; ix < s; ix++) {
        const vi = iy * s + ix;

        // Update height
        pos.setY(vi, terrain.height[vi] * HEIGHT_SCALE);

        // Compute color
        const biome = terrain.getBiome(ix, iy);
        let color: RGB = [...BIOME_COLORS[biome]] as RGB;

        // Height shading
        const h = terrain.height[vi];

        // Underwater/near-shore terrain: blend to ocean blue so it doesn't
        // show pink through the semi-transparent water plane
        if (h < 0.38) {
          const depth = Math.max(0, (0.38 - h) / 0.3); // gradual over a wider range
          const blend = Math.min(1.0, depth * 0.9);
          color[0] = Math.floor(color[0] * (1 - blend) + 20 * blend);
          color[1] = Math.floor(color[1] * (1 - blend) + 50 * blend);
          color[2] = Math.floor(color[2] * (1 - blend) + 100 * blend);
        }

        const shade = 0.85 + h * 0.3;
        color[0] = Math.floor(color[0] * shade);
        color[1] = Math.floor(color[1] * shade);
        color[2] = Math.floor(color[2] * shade);

        // Water tint
        const wl = water.getLevel(ix, iy);
        if (wl > 0.005) {
          const a = Math.min(0.85, wl * 3);
          color[0] = Math.floor(color[0] * (1 - a) + 30 * a);
          color[1] = Math.floor(color[1] * (1 - a) + 70 * a);
          color[2] = Math.floor(color[2] * (1 - a) + 170 * a);
        }

        // Plant overlay
        const plantType = flora.getType(ix, iy);
        if (plantType !== PlantType.NONE) {
          const pc = getPlantColor(plantType, flora.getStage(ix, iy), season);
          if (pc) color = pc;
        }

        // Daylight — keep channels proportional to avoid purple tint
        const dl = Math.max(0.25, daylight);
        color = [
          Math.floor(color[0] * dl),
          Math.floor(color[1] * dl),
          Math.floor(color[2] * dl),
        ];

        // Rain dim
        if (isRaining) {
          const dim = 1 - rainIntensity * 0.2;
          color = [
            Math.floor(color[0] * dim),
            Math.floor(color[1] * dim),
            Math.floor(Math.min(255, color[2] * dim + rainIntensity * 15)),
          ];
        }

        // Lava / geological heat glow
        if (heat) {
          const hv = heat[vi];
          if (hv > 0) {
            const t = hv / 255; // 0-1 heat intensity
            // Blend toward orange-red: hot = bright orange, cooling = dark red
            const lr = Math.floor(255 * t);
            const lg = Math.floor(120 * t * t); // Orange fades faster
            const lb = Math.floor(20 * t * t * t);
            const blend = Math.min(1.0, t * 1.5);
            color = [
              Math.floor(color[0] * (1 - blend) + lr * blend),
              Math.floor(color[1] * (1 - blend) + lg * blend),
              Math.floor(color[2] * (1 - blend) + lb * blend),
            ];
          }
        }

        col.setXYZ(vi, color[0] / 255, color[1] / 255, color[2] / 255);
      }
    }

    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  /** Convert a world (x, y) to 3D position on the mesh surface. */
  worldToSurface(wx: number, wy: number, terrain: Terrain): THREE.Vector3 {
    const ix = Math.floor(Math.max(0, Math.min(wx, this.size - 1)));
    const iy = Math.floor(Math.max(0, Math.min(wy, this.size - 1)));
    const h = terrain.height[iy * this.size + ix];
    return new THREE.Vector3(wx, h * HEIGHT_SCALE + 0.3, wy);
  }
}

export { HEIGHT_SCALE };
