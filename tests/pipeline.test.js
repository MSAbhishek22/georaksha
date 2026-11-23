/*
 * GeoRaksha pipeline test — run with:  node tests/pipeline.test.js
 * Feeds the sample stream generator through the real engine for 150
 * simulated seconds and checks that the alert story the demo promises
 * actually happens: ENTER, EXIT, SILENCE and RECOVERED all fire.
 */
'use strict';

const assert = require('node:assert');
const engine = require('../js/engine.js');
const { createSampleGenerator } = require('../js/sampleStream.js');

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

const monitor = engine.createMonitor({ silenceMs: 20000 });
monitor.addZone({
  id: 'yard', name: 'Central Yard', type: 'polygon',
  points: [
    { lat: 12.9690, lon: 77.5890 }, { lat: 12.9690, lon: 77.5910 },
    { lat: 12.9710, lon: 77.5910 }, { lat: 12.9710, lon: 77.5890 }
  ]
});
monitor.addZone({
  id: 'depot', name: 'Depot', type: 'circle',
  center: { lat: 12.9705, lon: 77.5925 }, radiusM: 130
});

// Deterministic starts (dashboard omits this and scatters the assets).
const gen = createSampleGenerator({ startDistances: [0, 0, 0, 0] });
gen.assetDefs().forEach(d => monitor.setSilenceLimit(d.assetId, 20000));

const t0 = 1_000_000_000;
const seen = { ENTER: 0, EXIT: 0, SILENCE: 0, RECOVERED: 0 };
let eventCount = 0;
let van03EventsDuringSilenceWindow = 0;

for (let s = 0; s <= 150; s++) {
  const now = t0 + s * 1000;
  for (const ev of gen.tick(now)) {
    eventCount += 1;
    if (ev.assetId === 'VAN-03' && s >= 46 && s < 85) van03EventsDuringSilenceWindow += 1;
    for (const a of monitor.ingest(ev)) seen[a.type] += 1;
  }
  for (const a of monitor.checkSilence(now)) seen[a.type] += 1;
}

test('the sample stream produces a steady flow of events', () => {
  assert.ok(eventCount > 400, 'got ' + eventCount);
});

test('VAN-03 really goes quiet inside its scripted silence window', () => {
  assert.strictEqual(van03EventsDuringSilenceWindow, 0);
});

test('assets entering zones raise ENTER alerts', () => {
  assert.ok(seen.ENTER >= 2, 'got ' + seen.ENTER);
});

test('assets leaving zones raise EXIT alerts', () => {
  assert.ok(seen.EXIT >= 1, 'got ' + seen.EXIT);
});

test('the silent asset raises exactly one SILENCE alert', () => {
  assert.strictEqual(seen.SILENCE, 1);
});

test('the silent asset raises RECOVERED when it reports again', () => {
  assert.strictEqual(seen.RECOVERED, 1);
});

console.log('\n' + passed + '/' + passed + ' pipeline tests passed');
console.log('Alert totals over 150 simulated seconds:', JSON.stringify(seen), '· events:', eventCount);
