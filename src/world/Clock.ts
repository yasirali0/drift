export class Clock {
  worldHour: number = 0;

  readonly hoursPerDay = 24;
  readonly daysPerSeason = 30;
  readonly seasonsPerYear = 4;
  readonly daysPerYear = 120;

  get hour(): number {
    return this.worldHour % this.hoursPerDay;
  }

  get day(): number {
    return (Math.floor(this.worldHour / this.hoursPerDay) % this.daysPerYear) + 1;
  }

  get dayOfSeason(): number {
    return ((this.day - 1) % this.daysPerSeason) + 1;
  }

  get season(): number {
    return Math.floor((this.day - 1) / this.daysPerSeason);
  }

  get seasonName(): string {
    return ['Spring', 'Summer', 'Autumn', 'Winter'][this.season];
  }

  get year(): number {
    return (
      Math.floor(this.worldHour / (this.hoursPerDay * this.daysPerYear)) + 1
    );
  }

  get daylight(): number {
    const h = this.hour;
    if (h >= 6 && h <= 18) {
      const t = (h - 6) / 12;
      return 0.3 + 0.7 * Math.sin(t * Math.PI);
    }
    return 0.15;
  }

  get growthMultiplier(): number {
    const s = this.season;
    if (s === 0) return 1.2; // Spring
    if (s === 1) return 1.0; // Summer
    if (s === 2) return 0.6; // Autumn
    return 0.1; // Winter
  }

  get rainChance(): number {
    const s = this.season;
    if (s === 0) return 0.3;
    if (s === 1) return 0.15;
    if (s === 2) return 0.25;
    return 0.2;
  }

  tick(): void {
    this.worldHour++;
  }

  formatTime(): string {
    const h = Math.floor(this.hour);
    return h.toString().padStart(2, '0') + ':00';
  }

  formatDate(): string {
    return `Year ${this.year}, ${this.seasonName} Day ${this.dayOfSeason}`;
  }
}
