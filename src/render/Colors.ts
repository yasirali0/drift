import { Biome } from '../world/Terrain';
import { PlantType, GrowthStage } from '../life/Flora';

export type RGB = [number, number, number];

export const BIOME_COLORS: Record<number, RGB> = {
  [Biome.DEEP_WATER]: [15, 40, 100],
  [Biome.WATER]: [30, 65, 140],
  [Biome.SAND]: [220, 210, 160],
  [Biome.GRASSLAND]: [95, 170, 65],
  [Biome.FOREST]: [50, 125, 45],
  [Biome.DENSE_FOREST]: [30, 90, 35],
  [Biome.MOUNTAIN]: [145, 135, 125],
  [Biome.SNOW]: [240, 245, 250],
};

export function getPlantColor(
  type: PlantType,
  stage: GrowthStage,
  season: number,
): RGB | null {
  if (type === PlantType.NONE) return null;

  const winterFade = season === 3 ? 0.5 : 1.0;
  const isAutumn = season === 2;

  switch (type) {
    case PlantType.GRASS: {
      const g = stage >= GrowthStage.MATURE ? 170 : 140;
      if (isAutumn) return [160, 150, 40];
      return [
        Math.floor(60 * winterFade),
        Math.floor(g * winterFade),
        Math.floor(30 * winterFade),
      ];
    }
    case PlantType.FLOWER: {
      if (stage < GrowthStage.MATURE) return [60, 140, 30];
      if (isAutumn) return [180, 100, 40];
      return [200, 80, 120];
    }
    case PlantType.BUSH: {
      if (isAutumn) return [160, 120, 30];
      const intensity = stage >= GrowthStage.MATURE ? 1 : 0.7;
      return [
        Math.floor(30 * intensity * winterFade),
        Math.floor(120 * intensity * winterFade),
        Math.floor(25 * intensity * winterFade),
      ];
    }
    case PlantType.TREE: {
      const maturity = stage >= GrowthStage.MATURE ? 1 : 0.6;
      if (isAutumn)
        return [
          Math.floor(180 * maturity),
          Math.floor(100 * maturity),
          20,
        ];
      if (season === 3) return [60, 70, 60];
      return [
        Math.floor(20 * maturity),
        Math.floor(90 * maturity),
        Math.floor(20 * maturity),
      ];
    }
  }
  return null;
}

export function applyDaylight(color: RGB, daylight: number): RGB {
  const night = 1 - daylight;
  return [
    Math.floor(color[0] * daylight + color[0] * 0.2 * night),
    Math.floor(color[1] * daylight + color[1] * 0.15 * night),
    Math.floor(
      color[2] * daylight + Math.min(255, color[2] * 0.4 + 20) * night,
    ),
  ];
}

export function applyRain(color: RGB, intensity: number): RGB {
  const dim = 1 - intensity * 0.2;
  return [
    Math.floor(color[0] * dim),
    Math.floor(color[1] * dim),
    Math.floor(Math.min(255, color[2] * dim + intensity * 15)),
  ];
}
