import { Creature, Diet, CreatureState } from '../life/Creature';
import { Camera } from './Camera';

const STATE_LABELS: Record<number, string> = {
  [CreatureState.WANDERING]: 'Wandering',
  [CreatureState.SEEKING_FOOD]: 'Seeking food',
  [CreatureState.FLEEING]: 'Fleeing!',
  [CreatureState.HUNTING]: 'Hunting',
  [CreatureState.RESTING]: 'Resting',
  [CreatureState.DEAD]: 'Dead',
};

export class InspectorPanel {
  private el: HTMLDivElement;
  private selected: Creature | null = null;
  private following = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'inspector';
    Object.assign(this.el.style, {
      position: 'absolute',
      top: '16px',
      right: '16px',
      width: '200px',
      background: 'rgba(0, 0, 0, 0.75)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '12px',
      fontFamily: "'Courier New', monospace",
      fontSize: '11px',
      lineHeight: '1.6',
      color: '#c0c0c0',
      display: 'none',
      userSelect: 'none',
      pointerEvents: 'auto',
    });
    document.body.appendChild(this.el);
  }

  get selectedCreature(): Creature | null {
    return this.selected;
  }

  get isFollowing(): boolean {
    return this.following;
  }

  select(creature: Creature | null): void {
    this.selected = creature;
    this.following = false;
    this.el.style.display = creature ? 'block' : 'none';
  }

  deselect(): void {
    this.selected = null;
    this.following = false;
    this.el.style.display = 'none';
  }

  toggleFollow(): void {
    if (this.selected) {
      this.following = !this.following;
    }
  }

  updateFollow(camera: Camera): void {
    if (this.following && this.selected && this.selected.isAlive) {
      camera.lookAt(this.selected.x, this.selected.y);
    }
  }

  render(): void {
    const c = this.selected;
    if (!c) return;

    if (!c.isAlive) {
      this.el.innerHTML = `
        <div style="color:#888;text-align:center;margin:8px 0;">
          This creature has died.
        </div>
        <div style="text-align:center;margin-top:8px;">
          <span style="color:#555;font-size:10px;">click elsewhere to dismiss</span>
        </div>
      `;
      this.following = false;
      return;
    }

    const g = c.genes;
    const diet = c.diet === Diet.PREDATOR ? '\u{1F43A} Predator' : '\u{1F407} Herbivore';
    const state = STATE_LABELS[c.state] || 'Unknown';
    const energyPct = Math.floor((c.energy / c.maxEnergy) * 100);
    const agePct = Math.floor((c.age / c.maxAge) * 100);
    const followLabel = this.following ? '[unfollow]' : '[follow]';

    this.el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="color:#ddd;font-size:12px;">${diet}</span>
        <span style="color:#555;font-size:10px;">#${c.id}</span>
      </div>
      <div style="color:#aaa;">${state}</div>
      <div style="margin-top:6px;">
        ${bar('Energy', energyPct, energyColor(energyPct))}
        ${bar('Age', agePct, ageColor(agePct))}
      </div>
      <div style="margin-top:8px;color:#888;font-size:10px;">
        Gen ${c.generation}
      </div>
      <div style="margin-top:8px;border-top:1px solid rgba(255,255,255,0.08);padding-top:8px;">
        <div style="color:#999;margin-bottom:4px;">Genome</div>
        ${geneStat('Speed', g.speed)}
        ${geneStat('Size', g.size)}
        ${geneStat('Vision', g.vision)}
        ${geneStat('Metabol', g.metabolism)}
        ${geneStat('Fertil', g.fertility)}
        ${geneStat('Aggress', g.aggression)}
        ${geneStat('Camo', g.camouflage)}
      </div>
      <div style="margin-top:8px;text-align:center;">
        <span id="follow-btn" style="color:#68a;cursor:pointer;font-size:10px;">${followLabel}</span>
      </div>
    `;

    const followBtn = document.getElementById('follow-btn');
    if (followBtn) {
      followBtn.onclick = () => this.toggleFollow();
    }
  }
}

function bar(label: string, pct: number, color: string): string {
  const clamped = Math.max(0, Math.min(100, pct));
  return `
    <div style="display:flex;align-items:center;margin:2px 0;">
      <span style="width:46px;color:#888;">${label}</span>
      <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
        <div style="width:${clamped}%;height:100%;background:${color};border-radius:3px;"></div>
      </div>
      <span style="width:30px;text-align:right;color:#888;font-size:9px;">${pct}%</span>
    </div>
  `;
}

function geneStat(label: string, val: number): string {
  const pct = Math.floor(val * 100);
  const w = Math.floor(val * 60);
  return `
    <div style="display:flex;align-items:center;margin:1px 0;">
      <span style="width:50px;color:#777;font-size:10px;">${label}</span>
      <div style="width:60px;height:3px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;">
        <div style="width:${w}px;height:100%;background:rgba(130,180,220,0.5);border-radius:2px;"></div>
      </div>
      <span style="width:26px;text-align:right;color:#666;font-size:9px;">.${pct.toString().padStart(2, '0')}</span>
    </div>
  `;
}

function energyColor(pct: number): string {
  if (pct > 60) return '#6a6';
  if (pct > 30) return '#aa6';
  return '#a66';
}

function ageColor(pct: number): string {
  if (pct < 40) return '#6a8';
  if (pct < 75) return '#888';
  return '#a66';
}
