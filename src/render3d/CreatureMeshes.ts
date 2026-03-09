import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Creature, Diet, CreatureState } from '../life/Creature';
import { Terrain } from '../world/Terrain';
import { TerrainMesh } from './TerrainMesh';

const MAX_INSTANCES = 2000; // Slightly above MAX_CREATURES
const MAX_INDICATORS = 200; // Max state indicators shown at once

/** Create a canvas texture with a text symbol for state indicators. */
function makeIconTexture(text: string, color: string): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shadow for visibility
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = color;
  ctx.fillText(text, size / 2, size / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** State indicator types */
enum IndicatorType { NONE, FLEE, HUNT, SEEK_FOOD, REST }

const INDICATOR_COLORS: Record<IndicatorType, string> = {
  [IndicatorType.NONE]: '',
  [IndicatorType.FLEE]: '#ff4444',
  [IndicatorType.HUNT]: '#ffcc33',
  [IndicatorType.SEEK_FOOD]: '#66dd66',
  [IndicatorType.REST]: '#88aaff',
};

const INDICATOR_SYMBOLS: Record<IndicatorType, string> = {
  [IndicatorType.NONE]: '',
  [IndicatorType.FLEE]: '!',
  [IndicatorType.HUNT]: '\u2694',  // ⚔
  [IndicatorType.SEEK_FOOD]: '?',
  [IndicatorType.REST]: 'z',
};

/** Build a low-poly quadruped herbivore (rabbit/deer-like). Faces +X. */
function buildHerbivoreGeo(): THREE.BufferGeometry {
  // Rounded body
  const body = new THREE.SphereGeometry(1, 8, 6);
  body.scale(1.3, 0.7, 0.8);
  body.translate(0, 0.5, 0);

  // Head
  const head = new THREE.SphereGeometry(0.4, 6, 5);
  head.translate(1.1, 0.85, 0);

  // Ears
  const earL = new THREE.ConeGeometry(0.12, 0.5, 4);
  earL.translate(0.95, 1.35, 0.15);
  const earR = new THREE.ConeGeometry(0.12, 0.5, 4);
  earR.translate(0.95, 1.35, -0.15);

  // Legs
  const legGeo = () => {
    const g = new THREE.CylinderGeometry(0.1, 0.1, 0.6, 5);
    return g;
  };
  const fl = legGeo(); fl.translate(0.55, -0.05, 0.35);
  const fr = legGeo(); fr.translate(0.55, -0.05, -0.35);
  const bl = legGeo(); bl.translate(-0.55, -0.05, 0.35);
  const br = legGeo(); br.translate(-0.55, -0.05, -0.35);

  // Short tail
  const tail = new THREE.SphereGeometry(0.18, 4, 4);
  tail.translate(-1.15, 0.6, 0);

  const merged = mergeGeometries([body, head, earL, earR, fl, fr, bl, br, tail]);
  merged.computeVertexNormals();
  return merged;
}

/** Build a low-poly predator (wolf/fox-like). Faces +X. */
function buildPredatorGeo(): THREE.BufferGeometry {
  // Sleek body
  const body = new THREE.SphereGeometry(1, 8, 6);
  body.scale(1.6, 0.55, 0.6);
  body.translate(0, 0.5, 0);

  // Head/snout — cone pointing forward
  const snout = new THREE.ConeGeometry(0.35, 0.9, 6);
  snout.rotateZ(-Math.PI / 2);
  snout.translate(1.5, 0.65, 0);

  // Ears — pointed triangles
  const earL = new THREE.ConeGeometry(0.1, 0.4, 3);
  earL.translate(1.0, 1.1, 0.18);
  const earR = new THREE.ConeGeometry(0.1, 0.4, 3);
  earR.translate(1.0, 1.1, -0.18);

  // Legs — longer and thinner
  const legGeo = () => {
    const g = new THREE.CylinderGeometry(0.08, 0.08, 0.7, 5);
    return g;
  };
  const fl = legGeo(); fl.translate(0.7, -0.05, 0.28);
  const fr = legGeo(); fr.translate(0.7, -0.05, -0.28);
  const bl = legGeo(); bl.translate(-0.7, -0.05, 0.28);
  const br = legGeo(); br.translate(-0.7, -0.05, -0.28);

  // Tail — long and thin
  const tail = new THREE.CylinderGeometry(0.06, 0.12, 1.0, 5);
  tail.rotateZ(Math.PI / 3);
  tail.translate(-1.5, 0.9, 0);

  const merged = mergeGeometries([body, snout, earL, earR, fl, fr, bl, br, tail]);
  merged.computeVertexNormals();
  return merged;
}

/**
 * Renders all creatures as instanced meshes for performance.
 * Herbivores = low-poly quadrupeds (rabbit/deer), Predators = sleek hunters (wolf/fox).
 * A selection ring highlights the picked creature.
 */
export class CreatureMeshes {
  readonly herbGroup: THREE.InstancedMesh;
  readonly predGroup: THREE.InstancedMesh;
  readonly selectionRing: THREE.Mesh;

  // State indicator sprites
  private indicatorSprites: THREE.Sprite[] = [];
  private indicatorTextures: Map<IndicatorType, THREE.SpriteMaterial> = new Map();
  private indicatorCount = 0;

  private herbCount = 0;
  private predCount = 0;
  private readonly dummy = new THREE.Object3D();
  private readonly herbColor = new THREE.Color();
  private readonly predColor = new THREE.Color();

  /** Maps instance index → creature.id for raycasting picks. */
  herbIds: number[] = [];
  predIds: number[] = [];

  constructor(scene: THREE.Scene) {
    // Herbivore geometry — low-poly quadruped
    const herbGeo = buildHerbivoreGeo();
    const herbMat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 20 });
    this.herbGroup = new THREE.InstancedMesh(herbGeo, herbMat, MAX_INSTANCES);
    this.herbGroup.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.herbGroup.frustumCulled = false;
    scene.add(this.herbGroup);

    // Predator geometry — sleek hunter
    const predGeo = buildPredatorGeo();
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

    // State indicator sprite materials
    for (const type of [IndicatorType.FLEE, IndicatorType.HUNT, IndicatorType.SEEK_FOOD, IndicatorType.REST]) {
      const tex = makeIconTexture(INDICATOR_SYMBOLS[type], INDICATOR_COLORS[type]);
      const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: false,
        sizeAttenuation: true,
      });
      this.indicatorTextures.set(type, mat);
    }

    // Pre-allocate sprite pool
    for (let i = 0; i < MAX_INDICATORS; i++) {
      const sprite = new THREE.Sprite(this.indicatorTextures.get(IndicatorType.FLEE)!);
      sprite.scale.set(3, 3, 1);
      sprite.visible = false;
      scene.add(sprite);
      this.indicatorSprites.push(sprite);
    }
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
    this.indicatorCount = 0;

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
        // Face movement direction
        const angle = Math.atan2(c.dy, c.dx);
        this.dummy.rotation.set(0, -angle + Math.PI / 2, 0);
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

      // State indicator sprite
      const indType = this.getIndicatorType(c.state);
      if (indType !== IndicatorType.NONE && this.indicatorCount < MAX_INDICATORS) {
        const sprite = this.indicatorSprites[this.indicatorCount++];
        sprite.material = this.indicatorTextures.get(indType)!;
        sprite.position.copy(pos);
        sprite.position.y += scale * 3.5;
        sprite.visible = true;
        // Pulse the indicator
        const pulse = 1.0 + Math.sin(frameTick * 0.15 + c.id) * 0.2;
        sprite.scale.set(2.5 * pulse, 2.5 * pulse, 1);
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

    // Hide unused indicator sprites
    for (let i = this.indicatorCount; i < MAX_INDICATORS; i++) {
      this.indicatorSprites[i].visible = false;
    }
  }

  private getIndicatorType(state: CreatureState): IndicatorType {
    switch (state) {
      case CreatureState.FLEEING: return IndicatorType.FLEE;
      case CreatureState.HUNTING: return IndicatorType.HUNT;
      case CreatureState.RESTING: return IndicatorType.REST;
      default: return IndicatorType.NONE;
    }
  }
}
