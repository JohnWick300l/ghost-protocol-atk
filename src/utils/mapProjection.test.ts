import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBoundingBox,
  projectCoordinates,
  generateSvgRoutePath,
  generateGraticules,
  calculateDirectBearing
} from './mapProjection.ts';

test('computeBoundingBox correctly encapsulates route coordinates with padding margin', () => {
  const points: [number, number][] = [
    [13.0358, 77.5970], // Hebbal
    [13.3702, 77.6835]  // Nandi Hills
  ];

  const bbox = computeBoundingBox(points, 0.1);
  assert.ok(bbox.minLat < 13.0358, 'minLat must be strictly lower than minimum lat');
  assert.ok(bbox.maxLat > 13.3702, 'maxLat must be strictly greater than maximum lat');
  assert.ok(bbox.minLng < 77.5970, 'minLng must be strictly lower than minimum lng');
  assert.ok(bbox.maxLng > 77.6835, 'maxLng must be strictly greater than maximum lng');
});

test('projectCoordinates maps latitude and longitude accurately with inverted screen Y', () => {
  const bbox = {
    minLat: 13.0,
    maxLat: 14.0,
    minLng: 77.0,
    maxLng: 78.0
  };

  const width = 800;
  const height = 500;
  const padding = 50;

  // Northern point (lat = 14.0) should map to top of screen (y = padding)
  const northPoint = projectCoordinates(14.0, 77.5, bbox, width, height, padding);
  assert.equal(northPoint.y, padding);

  // Southern point (lat = 13.0) should map to bottom of screen (y = height - padding)
  const southPoint = projectCoordinates(13.0, 77.5, bbox, width, height, padding);
  assert.equal(southPoint.y, height - padding);

  // Western point (lng = 77.0) should map to left (x = padding)
  const westPoint = projectCoordinates(13.5, 77.0, bbox, width, height, padding);
  assert.equal(westPoint.x, padding);

  // Eastern point (lng = 78.0) should map to right (x = width - padding)
  const eastPoint = projectCoordinates(13.5, 78.0, bbox, width, height, padding);
  assert.equal(eastPoint.x, width - padding);

  // Center point
  const centerPoint = projectCoordinates(13.5, 77.5, bbox, width, height, padding);
  assert.equal(centerPoint.x, width / 2);
  assert.equal(centerPoint.y, height / 2);
});

test('generateSvgRoutePath outputs valid SVG path syntax', () => {
  const points: [number, number][] = [
    [13.0358, 77.5970],
    [13.2483, 77.7126],
    [13.3702, 77.6835]
  ];
  const bbox = computeBoundingBox(points);
  const pathD = generateSvgRoutePath(points, bbox, 600, 400, 30);

  assert.ok(pathD.startsWith('M '), 'Path must begin with Move command');
  assert.ok(pathD.includes('L '), 'Path must include Line-to commands');
  const segmentCount = pathD.split('L').length - 1;
  assert.equal(segmentCount, 2, 'Must have 2 line segments for 3 points');
});

test('generateGraticules creates grid coordinates with proper directional formatting', () => {
  const bbox = {
    minLat: 13.0,
    maxLat: 13.4,
    minLng: 77.5,
    maxLng: 77.8
  };

  const graticules = generateGraticules(bbox, 600, 400, 30, 2, 2);
  assert.equal(graticules.length, 4);

  const latLines = graticules.filter(g => g.type === 'latitude');
  const lngLines = graticules.filter(g => g.type === 'longitude');
  assert.equal(latLines.length, 2);
  assert.equal(lngLines.length, 2);
  assert.match(latLines[0].formatted, /° N/);
  assert.match(lngLines[0].formatted, /° E/);
});

test('calculateDirectBearing correctly computes north-northeast flight direction', () => {
  // Bangalore Hebbal (13.0358, 77.5970) to Nandi Hills (13.3702, 77.6835)
  const { bearingDeg, compassDir } = calculateDirectBearing(13.0358, 77.5970, 13.3702, 77.6835);

  assert.ok(bearingDeg >= 10 && bearingDeg <= 20, `Expected bearing ~14°, got ${bearingDeg}`);
  assert.ok(['NNE', 'N'].includes(compassDir));
});
