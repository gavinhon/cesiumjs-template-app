import { MAP_COLORS } from '@/cesium/mapColors';
import type { CrowdLevel } from '@/lib/liveTrafficTypes';

export const CROWD_SYMBOL_SIZE: Record<CrowdLevel, number> = { '': 12, l: 16, m: 24, h: 32 };

const PIXELS = 64;

const symbols = new Map<CrowdLevel, string>();

export function crowdSymbol(level: CrowdLevel): string {
  const cached = symbols.get(level);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = PIXELS;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const middle = PIXELS / 2;
  const casing = MAP_COLORS.casing.toCssColorString();
  const disc = (radius: number, color: string) => {
    context.beginPath();
    context.arc(middle, middle, radius, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
  };
  const ring = (radius: number, width: number, color: string) => {
    context.beginPath();
    context.arc(middle, middle, radius, 0, Math.PI * 2);
    context.lineWidth = width;
    context.strokeStyle = color;
    context.stroke();
  };
  const color = (level ? MAP_COLORS.crowd[level] : MAP_COLORS.trafficBands[0]).toCssColorString();
  if (level === 'h') {
    disc(31, MAP_COLORS.crowd.h.withAlpha(0.3).toCssColorString());
    disc(19, casing);
    disc(16, color);
    disc(6, MAP_COLORS.location.toCssColorString());
  } else if (level === 'm') {
    disc(26, casing);
    ring(19, 7, color);
    disc(9, color);
  } else {
    disc(25, casing);
    ring(17, 9, color);
  }
  const url = canvas.toDataURL();
  symbols.set(level, url);
  return url;
}
