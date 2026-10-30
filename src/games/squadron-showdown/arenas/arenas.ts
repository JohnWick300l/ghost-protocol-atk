import { ArenaDefinition } from '../types';

export const SQUADRON_ARENAS: ArenaDefinition[] = [
  {
    id: 'ARENA_001',
    code: 'ARENA 001',
    name: 'NEON CITY',
    subtitle: 'Cyberpunk Downtown Overpass • 01:15 IST',
    description: 'Futuristic cyberpunk city street with parked electric superbikes, holographic billboards, and wet neon asphalt reflections.',
    themeColor: '#38bdf8',
    secondaryColor: '#f43f5e',
    skyGradient: ['#040711', '#0c1631', '#1b1438'],
    floorColor: '#090d1a',
    gridColor: '#38bdf8',
    ambientHazardText: 'WET ASPHALT TELEMETRY • HIGH VOLTAGE NEON GRID',
  },
  {
    id: 'ARENA_002',
    code: 'ARENA 002',
    name: 'ELECTRIC FACTORY',
    subtitle: 'Ultraviolette Assembly & Battery Core Bay',
    description: 'Industrial battery research and assembly facility with high-voltage Tesla coils, robotic gantry arms, and glowing energy conduits.',
    themeColor: '#facc15',
    secondaryColor: '#38bdf8',
    skyGradient: ['#070a0e', '#111927', '#1e293b'],
    floorColor: '#0f141c',
    gridColor: '#facc15',
    ambientHazardText: 'ACTIVE BATTERY TEST BAY • 800V BUS CAPACITORS ONLINE',
  },
  {
    id: 'ARENA_003',
    code: 'ARENA 003',
    name: 'SUPERNOVA STATION',
    subtitle: 'Hyper-Charging Squadron Hub • Space Station Alpha',
    description: 'High-tech electric charging hub illuminated by pulsing ultraviolet energy pylons, squadron banners, and telemetry holoscreens.',
    themeColor: '#a855f7',
    secondaryColor: '#06b6d4',
    skyGradient: ['#060412', '#170d36', '#2e1065'],
    floorColor: '#0c071e',
    gridColor: '#a855f7',
    ambientHazardText: 'SUPERNOVA FAST-CHARGE PYLONS • PEAK OUTPUT 100%',
  },
  {
    id: 'ARENA_004',
    code: 'ARENA 004',
    name: 'MIDNIGHT HIGHWAY',
    subtitle: 'Elevated Express Corridor • Redline Sector',
    description: 'Night-time elevated highway bridge with sweeping city lights, laser road markers, and roaring squadron formation bikes.',
    themeColor: '#ef4444',
    secondaryColor: '#f97316',
    skyGradient: ['#050508', '#180b14', '#2d0c16'],
    floorColor: '#0c0a0e',
    gridColor: '#ef4444',
    ambientHazardText: 'CLOSED EXPRESSWAY SECTOR • REDLINE INTERCEPT ZONE',
  },
];

export function getArenaById(id: string): ArenaDefinition {
  return SQUADRON_ARENAS.find((a) => a.id === id) || SQUADRON_ARENAS[0];
}
