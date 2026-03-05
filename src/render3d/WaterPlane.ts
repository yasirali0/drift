import * as THREE from 'three';
import { HEIGHT_SCALE } from './TerrainMesh';

/**
 * Animated water plane with vertex waves, specular shimmer, caustics, and shore foam.
 */
export class WaterPlane {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  private static readonly SEA_LEVEL_H = 0.35;

  constructor(worldSize: number) {
    const extent = worldSize * 15;
    // Higher subdivision for vertex wave displacement
    const geo = new THREE.PlaneGeometry(extent, extent, 128, 128);
    geo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: true,
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(0.05, 0.14, 0.38) },
        uShallowColor: { value: new THREE.Color(0.12, 0.42, 0.62) },
        uWorldCenter: { value: new THREE.Vector2(worldSize / 2, worldSize / 2) },
        uWorldSize: { value: worldSize * 1.0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uWindX: { value: 0.0 },
        uWindZ: { value: 0.0 },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uWindX;
        uniform float uWindZ;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vWaveHeight;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // World-space xz for wave calculation
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          float wx = wp.x;
          float wz = wp.z;

          // Multi-octave waves with wind influence
          float windOffX = uWindX * uTime * 2.0;
          float windOffZ = uWindZ * uTime * 2.0;

          float wave = 0.0;
          // Primary swell
          wave += sin(wx * 0.04 + uTime * 0.8 + windOffX) * 0.45;
          wave += sin(wz * 0.05 + uTime * 0.6 + windOffZ) * 0.35;
          // Secondary chop
          wave += sin(wx * 0.12 + wz * 0.08 + uTime * 1.4) * 0.15;
          wave += sin(wx * 0.07 - wz * 0.11 + uTime * 1.1) * 0.12;
          // Fine ripple
          wave += sin(wx * 0.25 + wz * 0.2 + uTime * 2.2) * 0.06;

          pos.y += wave;
          vWaveHeight = wave;
          vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec2 uWorldCenter;
        uniform float uWorldSize;
        uniform float uTime;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying vec3 vWorldPos;
        varying float vWaveHeight;

        // Simple hash for caustics
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float caustics(vec2 uv, float time) {
          // Smooth, organic caustic pattern using overlapping sine waves
          float c = 0.0;
          c += sin(uv.x * 3.7 + uv.y * 2.3 + time * 0.8) * 0.25;
          c += sin(uv.x * 5.1 - uv.y * 4.8 + time * 1.1) * 0.2;
          c += sin(uv.x * 7.3 + uv.y * 6.1 - time * 0.9) * 0.15;
          c += sin((uv.x + uv.y) * 9.0 + time * 1.5) * 0.1;
          return c * 0.5 + 0.5; // Normalize to 0-1 range
        }

        void main() {
          // Distance from island center for depth
          float dist = length(vWorldPos.xz - uWorldCenter) / uWorldSize;
          float depthMix = smoothstep(0.08, 0.55, dist);
          vec3 col = mix(uShallowColor, uDeepColor, depthMix);

          // Shore foam — only on open ocean coastline, not inland lakes
          // Use a broader distance threshold so inland water stays clean
          float oceanShore = smoothstep(0.20, 0.28, dist) * (1.0 - smoothstep(0.28, 0.45, dist));
          float foamPattern = noise(vWorldPos.xz * 0.5 + uTime * vec2(0.3, 0.2));
          float foam = oceanShore * smoothstep(0.4, 0.7, foamPattern);
          col = mix(col, vec3(0.8, 0.88, 0.93), foam * 0.25);

          // Very subtle caustic shimmer on shallow water
          float causticsVal = caustics(vWorldPos.xz * 0.08, uTime * 0.35);
          float shallowMask = 1.0 - smoothstep(0.05, 0.25, dist);
          col += vec3(0.02, 0.03, 0.02) * causticsVal * shallowMask;

          // Wave-crest highlight (very subtle)
          float crest = smoothstep(0.4, 0.9, vWaveHeight);
          col += vec3(0.03, 0.04, 0.05) * crest;

          // Specular shimmer — only on deeper open water, not inland lakes
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          // Use noise-based normal perturbation for organic sparkle
          float noiseNx = noise(vWorldPos.xz * 0.15 + uTime * vec2(0.4, 0.2)) - 0.5
                        + (noise(vWorldPos.xz * 0.4 + uTime * vec2(-0.3, 0.5)) - 0.5) * 0.5;
          float noiseNz = noise(vWorldPos.zx * 0.15 + uTime * vec2(0.3, -0.2)) - 0.5
                        + (noise(vWorldPos.zx * 0.4 + uTime * vec2(0.5, 0.3)) - 0.5) * 0.5;
          vec3 waveNormal = normalize(vec3(-noiseNx * 0.4, 1.0, -noiseNz * 0.4));
          vec3 halfVec = normalize(uSunDir + viewDir);
          float spec = pow(max(dot(waveNormal, halfVec), 0.0), 300.0);
          // Fade specular out near the island center (dist < 0.2 = inland water)
          float specMask = smoothstep(0.12, 0.30, dist);
          col += vec3(1.0, 0.95, 0.8) * spec * 0.5 * specMask;

          // Edge fade at far distance
          float edgeDist = length(vUv - vec2(0.5)) * 2.0;
          float edgeFade = smoothstep(0.85, 1.0, edgeDist);
          col = mix(col, uDeepColor * 0.5, edgeFade);

          // Slight transparency at shallow areas
          float alpha = mix(0.82, 1.0, smoothstep(0.05, 0.25, dist));
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    const seaY = WaterPlane.SEA_LEVEL_H * HEIGHT_SCALE;
    this.mesh.position.set(worldSize / 2 - 0.5, seaY, worldSize / 2 - 0.5);
  }

  update(time: number, daylight: number, windX = 0, windZ = 0): void {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uWindX.value = windX;
    this.material.uniforms.uWindZ.value = windZ;

    const d = 0.4 + daylight * 0.6;
    this.material.uniforms.uDeepColor.value.setRGB(0.05 * d, 0.14 * d, 0.38 * d);
    this.material.uniforms.uShallowColor.value.setRGB(0.14 * d, 0.44 * d, 0.65 * d);

    // Sun direction follows daylight — low at dawn/dusk, high at noon
    const sunAngle = daylight * Math.PI * 0.45;
    this.material.uniforms.uSunDir.value.set(
      Math.cos(sunAngle) * 0.5,
      Math.sin(sunAngle) * 0.8 + 0.2,
      0.3,
    ).normalize();
  }
}
