import * as THREE from 'three';
import { HEIGHT_SCALE } from './TerrainMesh';

/**
 * Opaque water plane with depth-gradient coloring from shallow cyan to deep blue.
 * Flat geometry at a fixed sea level, color darkens at far edges.
 */
export class WaterPlane {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  private static readonly SEA_LEVEL_H = 0.35;

  constructor(worldSize: number) {
    // Flat plane — no subdivisions needed since waves are fragment-only
    const extent = worldSize * 15;
    const geo = new THREE.PlaneGeometry(extent, extent, 4, 4);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      transparent: false,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(0.05, 0.14, 0.38) },
        uShallowColor: { value: new THREE.Color(0.12, 0.42, 0.62) },
        uOpacity: { value: 0.92 },
        uWorldCenter: { value: new THREE.Vector2(worldSize / 2, worldSize / 2) },
        uWorldSize: { value: worldSize * 1.0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform float uOpacity;
        uniform vec2 uWorldCenter;
        uniform float uWorldSize;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPos;

        void main() {
          // Distance from island center for depth coloring
          float dist = length(vWorldPos.xz - uWorldCenter) / uWorldSize;
          float depthMix = smoothstep(0.1, 0.6, dist);
          vec3 col = mix(uShallowColor, uDeepColor, depthMix);

          // Blend to darker at far edges
          float edgeDist = length(vUv - vec2(0.5)) * 2.0;
          float edgeFade = smoothstep(0.85, 1.0, edgeDist);
          vec3 fogCol = uDeepColor * 0.6;
          col = mix(col, fogCol, edgeFade);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    const seaY = WaterPlane.SEA_LEVEL_H * HEIGHT_SCALE;
    this.mesh.position.set(worldSize / 2 - 0.5, seaY, worldSize / 2 - 0.5);
  }

  update(time: number, daylight: number): void {
    this.material.uniforms.uTime.value = time;
    const d = 0.4 + daylight * 0.6;
    this.material.uniforms.uDeepColor.value.setRGB(0.05 * d, 0.14 * d, 0.38 * d);
    this.material.uniforms.uShallowColor.value.setRGB(0.14 * d, 0.44 * d, 0.65 * d);
  }
}
