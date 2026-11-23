# GeoRaksha — Geofencing and Real-Time Alerts

**Configure 2026 (Bosch) · Team CFG-5RZN · Problem statement: "Geofencing and Real-Time Alerts"**

GeoRaksha draws invisible fences on a map — around a yard, a depot, a site
gate — and raises an alert the moment a vehicle or a person crosses one, or
stops reporting altogether. Four alert types: **enter, exit, silence,
recovered**. The alert is raised by the same event that crossed the line,
not by a summary written later.

## Try it
Open `index.html` (or the live deployment) and the watch floor starts on its
own: two zones are drawn, four sample assets are moving, and alerts land in
the feed as crossings happen. Draw your own zone on the map — polygon or
circle — and the engine starts judging positions against it immediately.

## How it is built
One pipeline, four parts, and the parts do not leak into each other:

```
stream adapter  →  geofence engine  →  alert rules  →  dashboard
```

| File | What it does |
|---|---|
| `js/engine.js` | The geofence engine. Pure logic — point-in-polygon, true distance for circles, enter/exit state per asset and zone, silence detection. No DOM, no timers; runs in the browser and in Node. |
| `js/adapters.js` | The stream interface (`start` / `stop`). A sample adapter for local work, and the Condense adapter that takes a URL + one message-mapping function. |
| `js/sampleStream.js` | A local sample generator that mimics the expected shape of the organisers' data generator, so the swap at the event is a config change. Clearly labelled as sample data in the UI. |
| `js/app.js` | The dashboard: schematic map, zone drawing, asset list, alert feed. It draws what the engine decided; it decides nothing itself. |
| `index.html`, `css/styles.css` | The landing page (problem → solution → the app → outcome) and the watch floor. |

## The Condense connection
At the event, the position stream comes from the organisers' Condense data
generator. Connecting it means filling in one config block in `js/app.js`
(`STREAM_CONFIG`) — endpoint plus a function that translates one raw
generator message into `{assetId, lat, lon, ts}`. Full steps, the field
mapping table and the filing checklist live in **CONDENSE_HOOKUP.md**.

Until then, this public build runs on the sample stream, and says so on
screen. Nothing here is presented as real event data.

## Tests
```
node tests/engine.test.js     # 20 tests: geometry, crossings, silence
node tests/pipeline.test.js   # 6 tests: sample stream → engine → alerts
```
26/26 passing on 23 Nov 2026. The pipeline test runs 150 simulated seconds
and confirms the full story fires: ENTER ×3, EXIT ×2, SILENCE ×1,
RECOVERED ×1.

## Deployment
Static site, no build step. **Status 23 Nov 2026: built and verified
locally; not yet deployed.** The GitHub connector cannot create repos
(403), so the repo `MSAbhishek22/georaksha` must be created once in a
browser — then the prepared local git repo pushes and GitHub Pages serves
it at `https://msabhishek22.github.io/georaksha/`. Exact steps in
**DEPLOY.md**. Repo: _(pending creation)_ · Live URL: _(pending)_ ·
Deployed commit: _(pending)_.
