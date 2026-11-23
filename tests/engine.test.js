/*
 * GeoRaksha engine tests — run with:  node tests/engine.test.js
 * Plain assertions, no framework. Exit code 0 = all pass, 1 = a failure.
 * Never edit a test to make it pass; fix the engine instead.
 */
'use strict';

const assert = require('node:assert');
const engine = require('../js/engine.js');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('PASS  ' + name);
  } catch (err) {
    console.error('FAIL  ' + name);
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

// A square zone around (12.9700, 77.5900), roughly 220 m across.
const SQUARE = [
  { lat: 12.9690, lon: 77.5890 },
  { lat: 12.9690, lon: 77.5910 },
  { lat: 12.9710, lon: 77.5910 },
  { lat: 12.9710, lon: 77.5890 }
];
const CENTRE = { lat: 12.9700, lon: 77.5900 };
const FAR_AWAY = { lat: 12.9500, lon: 77.5600 };

test('haversine: same point is 0 m', () => {
  assert.strictEqual(engine.haversineM(CENTRE, CENTRE), 0);
});

test('haversine: 0.001 deg of latitude is about 111 m', () => {
  const d = engine.haversineM(CENTRE, { lat: 12.9710, lon: 77.5900 });
  assert.ok(d > 105 && d < 118, 'got ' + d);
});

test('pointInPolygon: centre of the square is inside', () => {
  assert.strictEqual(engine.pointInPolygon(CENTRE, SQUARE), true);
});

test('pointInPolygon: a far point is outside', () => {
  assert.strictEqual(engine.pointInPolygon(FAR_AWAY, SQUARE), false);
});

test('pointInPolygon: a point on the edge counts as inside', () => {
  assert.strictEqual(engine.pointInPolygon({ lat: 12.9690, lon: 77.5900 }, SQUARE), true);
});

test('pointInPolygon: a point on a vertex counts as inside', () => {
  assert.strictEqual(engine.pointInPolygon({ lat: 12.9710, lon: 77.5910 }, SQUARE), true);
});

test('pointInPolygon: just outside the edge is outside', () => {
  assert.strictEqual(engine.pointInPolygon({ lat: 12.9689, lon: 77.5900 }, SQUARE), false);
});

test('pointInPolygon: fewer than 3 points is never inside', () => {
  assert.strictEqual(engine.pointInPolygon(CENTRE, [CENTRE, FAR_AWAY]), false);
});

test('pointInZone: circle zone uses real distance', () => {
  const zone = { id: 'c1', name: 'Depot', type: 'circle', center: CENTRE, radiusM: 100 };
  assert.strictEqual(engine.pointInZone({ lat: 12.9705, lon: 77.5900 }, zone), true);  // ~56 m
  assert.strictEqual(engine.pointInZone({ lat: 12.9720, lon: 77.5900 }, zone), false); // ~222 m
});

test('monitor: ENTER fires once when an asset crosses in', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.addZone({ id: 'z1', name: 'Yard', type: 'polygon', points: SQUARE });
  assert.deepStrictEqual(m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 1000 }), []);
  const alerts = m.ingest({ assetId: 'A', ...CENTRE, ts: 2000 });
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'ENTER');
  assert.strictEqual(alerts[0].zoneName, 'Yard');
  // Still inside on the next event: no repeat alert.
  assert.deepStrictEqual(m.ingest({ assetId: 'A', lat: 12.9702, lon: 77.5901, ts: 3000 }), []);
});

test('monitor: EXIT fires when the asset leaves', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.addZone({ id: 'z1', name: 'Yard', type: 'polygon', points: SQUARE });
  m.ingest({ assetId: 'A', ...CENTRE, ts: 1000 });
  const alerts = m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 2000 });
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'EXIT');
});

test('monitor: first event inside a zone is an ENTER (engine only knows the stream)', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.addZone({ id: 'z1', name: 'Yard', type: 'polygon', points: SQUARE });
  const alerts = m.ingest({ assetId: 'B', ...CENTRE, ts: 1000 });
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'ENTER');
});

test('monitor: assets are tracked independently', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.addZone({ id: 'z1', name: 'Yard', type: 'polygon', points: SQUARE });
  m.ingest({ assetId: 'A', ...CENTRE, ts: 1000 });
  assert.deepStrictEqual(m.ingest({ assetId: 'B', ...FAR_AWAY, ts: 1000 }), []);
  const st = m.state();
  assert.deepStrictEqual(st.assets.A.insideZones, ['z1']);
  assert.deepStrictEqual(st.assets.B.insideZones, []);
});

test('monitor: overlapping zones each get their own alert', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.addZone({ id: 'z1', name: 'Yard', type: 'polygon', points: SQUARE });
  m.addZone({ id: 'z2', name: 'Depot circle', type: 'circle', center: CENTRE, radiusM: 150 });
  const alerts = m.ingest({ assetId: 'A', ...CENTRE, ts: 1000 });
  assert.strictEqual(alerts.length, 2);
  assert.ok(alerts.every(a => a.type === 'ENTER'));
});

test('monitor: removing a zone stops its alerts', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.addZone({ id: 'z1', name: 'Yard', type: 'polygon', points: SQUARE });
  m.ingest({ assetId: 'A', ...CENTRE, ts: 1000 });
  m.removeZone('z1');
  assert.deepStrictEqual(m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 2000 }), []);
});

test('silence: an asset past its limit is flagged once', () => {
  const m = engine.createMonitor({ silenceMs: 10000 });
  m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 0 });
  assert.deepStrictEqual(m.checkSilence(5000), []);
  const alerts = m.checkSilence(11000);
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'SILENCE');
  // Not flagged twice.
  assert.deepStrictEqual(m.checkSilence(20000), []);
});

test('silence: per-asset limit overrides the default', () => {
  const m = engine.createMonitor({ silenceMs: 60000 });
  m.setSilenceLimit('A', 5000);
  m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 0 });
  m.ingest({ assetId: 'B', ...FAR_AWAY, ts: 0 });
  const alerts = m.checkSilence(6000);
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].assetId, 'A');
});

test('silence: an asset that never reported is not flagged', () => {
  const m = engine.createMonitor({ silenceMs: 1000 });
  assert.deepStrictEqual(m.checkSilence(999999), []);
});

test('silence: reporting again raises RECOVERED and clears the flag', () => {
  const m = engine.createMonitor({ silenceMs: 10000 });
  m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 0 });
  m.checkSilence(11000);
  const alerts = m.ingest({ assetId: 'A', ...FAR_AWAY, ts: 12000 });
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].type, 'RECOVERED');
  assert.strictEqual(m.state().assets.A.silent, false);
});

test('monitor: malformed events are ignored, not crashed on', () => {
  const m = engine.createMonitor({ silenceMs: 1000 });
  assert.deepStrictEqual(m.ingest(null), []);
  assert.deepStrictEqual(m.ingest({ assetId: 'A' }), []);
  assert.deepStrictEqual(m.ingest({ assetId: 'A', lat: 'x', lon: 1, ts: 0 }), []);
});

console.log('\n' + passed + '/' + passed + ' engine tests passed');
