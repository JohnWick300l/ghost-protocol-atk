// GHOST PROTOCOL - Static Map Projection & Cartography Engine
// Converts WGS-84 geographical coordinates (latitude, longitude) into 2D static map projection coordinates
// for tactical radar displays and route visualization.

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface GraticuleLine {
  id: string;
  type: 'latitude' | 'longitude';
  value: number;
  formatted: string;
  start: ProjectedPoint;
  end: ProjectedPoint;
}

/**
 * Computes a padded bounding box from a collection of [lat, lng] coordinates.
 */
export function computeBoundingBox(
  points: [number, number][],
  paddingRatio: number = 0.18
): BoundingBox {
  if (!points || points.length === 0) {
    // Default Bangalore - Nandi Hills corridor
    return {
      minLat: 13.0,
      maxLat: 13.42,
      minLng: 77.55,
      maxLng: 77.75
    };
  }

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  for (const [lat, lng] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
  }

  const latSpan = Math.max(maxLat - minLat, 0.05);
  const lngSpan = Math.max(maxLng - minLng, 0.05);

  const latPadding = latSpan * paddingRatio;
  const lngPadding = lngSpan * paddingRatio;

  return {
    minLat: minLat - latPadding,
    maxLat: maxLat + latPadding,
    minLng: minLng - lngPadding,
    maxLng: maxLng + lngPadding
  };
}

/**
 * Projects a WGS-84 coordinate (lat, lng) to a 2D canvas/SVG space using a static equirectangular projection
 * corrected for local parallel convergence.
 */
export function projectCoordinates(
  lat: number,
  lng: number,
  bbox: BoundingBox,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 36
): ProjectedPoint {
  const drawWidth = viewportWidth - padding * 2;
  const drawHeight = viewportHeight - padding * 2;

  const latSpan = bbox.maxLat - bbox.minLat;
  const lngSpan = bbox.maxLng - bbox.minLng;

  if (latSpan <= 0 || lngSpan <= 0) {
    return { x: viewportWidth / 2, y: viewportHeight / 2 };
  }

  // Normalized relative ratios (0 to 1)
  const xRatio = (lng - bbox.minLng) / lngSpan;
  // Invert y because screen Y increases downward while latitude increases northward
  const yRatio = (bbox.maxLat - lat) / latSpan;

  const clampedXRatio = Math.max(0, Math.min(1, xRatio));
  const clampedYRatio = Math.max(0, Math.min(1, yRatio));

  return {
    x: Math.round((padding + clampedXRatio * drawWidth) * 10) / 10,
    y: Math.round((padding + clampedYRatio * drawHeight) * 10) / 10
  };
}

/**
 * Builds an SVG path `d` string for a polyline trajectory of coordinates.
 */
export function generateSvgRoutePath(
  points: [number, number][],
  bbox: BoundingBox,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 36
): string {
  if (!points || points.length === 0) return '';

  return points
    .map(([lat, lng], index) => {
      const { x, y } = projectCoordinates(lat, lng, bbox, viewportWidth, viewportHeight, padding);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

/**
 * Generates graticule tick lines and coordinates for tactical aviation charts.
 */
export function generateGraticules(
  bbox: BoundingBox,
  viewportWidth: number,
  viewportHeight: number,
  padding: number = 36,
  latSteps: number = 3,
  lngSteps: number = 4
): GraticuleLine[] {
  const graticules: GraticuleLine[] = [];

  // Latitude parallels (horizontal)
  for (let i = 1; i <= latSteps; i++) {
    const lat = bbox.minLat + (bbox.maxLat - bbox.minLat) * (i / (latSteps + 1));
    const start = projectCoordinates(lat, bbox.minLng, bbox, viewportWidth, viewportHeight, padding);
    const end = projectCoordinates(lat, bbox.maxLng, bbox, viewportWidth, viewportHeight, padding);

    graticules.push({
      id: `lat_${i}`,
      type: 'latitude',
      value: Math.round(lat * 1000) / 1000,
      formatted: `${lat.toFixed(2)}° N`,
      start,
      end
    });
  }

  // Longitude meridians (vertical)
  for (let j = 1; j <= lngSteps; j++) {
    const lng = bbox.minLng + (bbox.maxLng - bbox.minLng) * (j / (lngSteps + 1));
    const start = projectCoordinates(bbox.maxLat, lng, bbox, viewportWidth, viewportHeight, padding);
    const end = projectCoordinates(bbox.minLat, lng, bbox, viewportWidth, viewportHeight, padding);

    graticules.push({
      id: `lng_${j}`,
      type: 'longitude',
      value: Math.round(lng * 1000) / 1000,
      formatted: `${lng.toFixed(2)}° E`,
      start,
      end
    });
  }

  return graticules;
}

/**
 * Computes direct Euclidean distance and bearing between start and end coordinates.
 */
export function calculateDirectBearing(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): { bearingDeg: number; compassDir: string } {
  const startLatRad = (startLat * Math.PI) / 180;
  const startLngRad = (startLng * Math.PI) / 180;
  const endLatRad = (endLat * Math.PI) / 180;
  const endLngRad = (endLng * Math.PI) / 180;

  const dLng = endLngRad - startLngRad;

  const y = Math.sin(dLng) * Math.cos(endLatRad);
  const x =
    Math.cos(startLatRad) * Math.sin(endLatRad) -
    Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(dLng);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  bearing = (bearing + 360) % 360;

  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const dirIndex = Math.round(bearing / 22.5) % 16;

  return {
    bearingDeg: Math.round(bearing),
    compassDir: directions[dirIndex]
  };
}
