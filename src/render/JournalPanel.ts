import { EventJournal, JournalEntry } from '../world/EventJournal';
import { Clock } from '../world/Clock';

const CATEGORY_COLORS: Record<string, string> = {
  ecology: '#7a7',
  fauna: '#8ab',
  weather: '#aa8',
  milestone: '#da8',
};

export class JournalPanel {
  private el: HTMLDivElement;
  private visible = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'journal';
    Object.assign(this.el.style, {
      position: 'absolute',
      bottom: '130px',
      right: '16px',
      width: '240px',
      maxHeight: '300px',
      overflowY: 'auto',
      background: 'rgba(0, 0, 0, 0.75)',
      borderRadius: '8px',
      border: '1px solid rgba(255,255,255,0.1)',
      padding: '10px',
      fontFamily: "'Courier New', monospace",
      fontSize: '10px',
      lineHeight: '1.5',
      color: '#999',
      display: 'none',
      pointerEvents: 'auto',
    });

    // Custom scrollbar
    const style = document.createElement('style');
    style.textContent = `
      #journal::-webkit-scrollbar { width: 4px; }
      #journal::-webkit-scrollbar-track { background: transparent; }
      #journal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? 'block' : 'none';
  }

  render(journal: EventJournal, clock: Clock): void {
    if (!this.visible) return;

    const recent = journal.getRecent(20);
    if (recent.length === 0) {
      this.el.innerHTML = '<div style="color:#555;text-align:center;">No events yet</div>';
      return;
    }

    this.el.innerHTML = `
      <div style="color:#777;margin-bottom:6px;font-size:9px;text-transform:uppercase;letter-spacing:1px;">World Journal</div>
      ${recent
        .slice()
        .reverse()
        .map((e) => this.renderEntry(e, clock))
        .join('')}
    `;
  }

  private renderEntry(entry: JournalEntry, clock: Clock): string {
    const color = CATEGORY_COLORS[entry.category] || '#888';
    const timeStr = formatWorldHour(entry.worldHour, clock);
    return `
      <div style="margin-bottom:4px;padding-bottom:4px;border-bottom:1px solid rgba(255,255,255,0.04);">
        <span style="color:#555;">${timeStr}</span>
        <div style="color:${color};">${entry.text}</div>
      </div>
    `;
  }
}

function formatWorldHour(worldHour: number, clock: Clock): string {
  const year = Math.floor(worldHour / (clock.hoursPerDay * clock.daysPerYear)) + 1;
  const dayInYear = Math.floor(worldHour / clock.hoursPerDay) % clock.daysPerYear + 1;
  const season = Math.floor((dayInYear - 1) / clock.daysPerSeason);
  const seasonNames = ['Spr', 'Sum', 'Aut', 'Win'];
  return `Y${year} ${seasonNames[season]}`;
}
