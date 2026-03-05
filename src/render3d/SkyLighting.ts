import * as THREE from 'three';

/**
 * Manages directional "sun" light with shadow map, ambient light, hemisphere light,
 * sky gradient dome, and exponential fog.
 */
export class SkyLighting {
  readonly sunLight: THREE.DirectionalLight;
  readonly ambientLight: THREE.AmbientLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly skyDome: THREE.Mesh;

  constructor(scene: THREE.Scene, worldSize: number) {
    // Sun with shadow casting
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.sunLight.position.set(worldSize * 0.4, 80, worldSize * 0.3);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    const shadowCam = this.sunLight.shadow.camera;
    shadowCam.left = -worldSize * 0.6;
    shadowCam.right = worldSize * 0.6;
    shadowCam.top = worldSize * 0.6;
    shadowCam.bottom = -worldSize * 0.6;
    shadowCam.near = 1;
    shadowCam.far = 500;
    this.sunLight.shadow.bias = -0.001;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target);

    // Ambient fill — warm neutral to avoid purple tint on cliffs
    this.ambientLight = new THREE.AmbientLight(0x607080, 0.45);
    scene.add(this.ambientLight);

    // Hemisphere — sky/ground color bleed
    this.hemiLight = new THREE.HemisphereLight(0x88aacc, 0x556644, 0.4);
    scene.add(this.hemiLight);

    // Sky gradient dome
    this.skyDome = this.createSkyDome();
    scene.add(this.skyDome);

    // Fog
    scene.fog = new THREE.FogExp2(0x88aacc, 0.0008);
    scene.background = new THREE.Color(0x88aacc);
  }

  private createSkyDome(): THREE.Mesh {
    const geo = new THREE.SphereGeometry(1200, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0.25, 0.45, 0.8) },
        uHorizonColor: { value: new THREE.Color(0.6, 0.75, 0.9) },
        uBottomColor: { value: new THREE.Color(0.08, 0.15, 0.35) },
        uTime: { value: 0.0 },
        uCloudOpacity: { value: 0.35 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;
        void main() {
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          vLocalPos = position.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uHorizonColor;
        uniform vec3 uBottomColor;
        uniform float uTime;
        uniform float uCloudOpacity;
        varying vec3 vWorldPos;
        varying vec3 vLocalPos;

        // Simple hash-based noise for clouds
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
        float fbm(vec2 p) {
          float v = 0.0;
          v += noise(p * 1.0) * 0.5;
          v += noise(p * 2.0 + 13.7) * 0.25;
          v += noise(p * 4.0 + 27.3) * 0.125;
          return v;
        }

        void main() {
          float h = normalize(vWorldPos).y;
          vec3 col;
          if (h > 0.0) {
            col = mix(uHorizonColor, uTopColor, smoothstep(0.0, 0.5, h));
          } else {
            col = mix(uHorizonColor, uBottomColor, smoothstep(0.0, -0.3, h));
          }

          // Clouds in the upper hemisphere, fade below h=0.15 to avoid showing through water
          if (h > 0.12 && h < 0.55) {
            vec3 dir = normalize(vLocalPos);
            vec2 cloudUV = dir.xz / (dir.y + 0.3) * 0.8;
            cloudUV += uTime * vec2(0.008, 0.003);
            float cloud = fbm(cloudUV * 3.0);
            cloud = smoothstep(0.35, 0.65, cloud);
            // Fade near horizon (strong fade) and zenith
            float hFade = smoothstep(0.12, 0.25, h) * smoothstep(0.55, 0.35, h);
            cloud *= hFade * uCloudOpacity;
            col = mix(col, vec3(1.0, 0.98, 0.95), cloud);
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    return new THREE.Mesh(geo, mat);
  }

  update(
    scene: THREE.Scene,
    daylight: number,
    isRaining: boolean,
    rainIntensity: number,
    worldSize: number,
    elapsed: number = 0,
  ): void {
    // Sun angle follows daylight (approximate arc)
    const sunAngle = daylight * Math.PI;
    const sunY = Math.sin(sunAngle) * 120;
    const sunZ = Math.cos(sunAngle) * worldSize * 0.5;
    this.sunLight.position.set(worldSize * 0.4, Math.max(10, sunY), sunZ);
    this.sunLight.target.position.set(worldSize / 2, 0, worldSize / 2);

    // Sun intensity
    this.sunLight.intensity = daylight * 1.5;

    // Sun color — warm golden at dawn/dusk, white at noon
    if (daylight < 0.3) {
      this.sunLight.color.setRGB(1.0, 0.6, 0.3);
    } else if (daylight < 0.5) {
      this.sunLight.color.setRGB(1.0, 0.8, 0.5);
    } else {
      this.sunLight.color.setRGB(1.0, 0.98, 0.92);
    }

    // Rain dims everything
    const rainDim = isRaining ? 1 - rainIntensity * 0.35 : 1;
    this.sunLight.intensity *= rainDim;

    // Ambient — brighter in day, neutral-cool at night (avoid purple)
    const ambIntensity = 0.3 + daylight * 0.35;
    this.ambientLight.intensity = ambIntensity * rainDim;
    if (daylight < 0.3) {
      this.ambientLight.color.setRGB(0.2, 0.22, 0.3);
    } else {
      this.ambientLight.color.setRGB(0.55, 0.52, 0.5);
    }

    // Hemisphere light — adjust for time of day
    this.hemiLight.intensity = 0.25 + daylight * 0.35;

    // Sky dome colors
    const skyMat = this.skyDome.material as THREE.ShaderMaterial;
    const rd = isRaining ? 0.6 : 1.0;
    skyMat.uniforms.uTopColor.value.setRGB(
      lerp(0.02, 0.25 * rd, daylight),
      lerp(0.03, 0.45 * rd, daylight),
      lerp(0.08, 0.8 * rd, daylight),
    );
    skyMat.uniforms.uHorizonColor.value.setRGB(
      lerp(0.05, isRaining ? 0.45 : 0.65, daylight),
      lerp(0.05, isRaining ? 0.5 : 0.75, daylight),
      lerp(0.1, isRaining ? 0.5 : 0.9, daylight),
    );

    // Fog color matches horizon
    const fogR = lerp(0.05, isRaining ? 0.45 : 0.6, daylight);
    const fogG = lerp(0.05, isRaining ? 0.48 : 0.72, daylight);
    const fogB = lerp(0.12, isRaining ? 0.5 : 0.85, daylight);
    const fogColor = new THREE.Color(fogR, fogG, fogB);
    (scene.fog as THREE.FogExp2).color.copy(fogColor);
    // Background is hidden by sky dome, but set it for consistency
    (scene.background as THREE.Color).copy(fogColor);

    // Cloud animation
    skyMat.uniforms.uTime.value = elapsed;
    skyMat.uniforms.uCloudOpacity.value = isRaining ? 0.55 : 0.3 * daylight;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
