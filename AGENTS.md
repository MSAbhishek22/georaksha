# AGENTS.md — GeoRaksha (Configure 2026, Team CFG-5RZN)

Read this first, then `~/workspace/abhi_22/ABHI_22_UNIFIED_MASTER_BLUEPRINT.md`
("READ THIS FIRST" + Part V) before touching this project. The blueprint is the
single source of truth; this file only records project-specific facts.

## What this is
GeoRaksha — a geofence monitoring dashboard for Configure 2026 (Bosch),
problem statement **"Geofencing and Real-Time Alerts"**. Filing deadline
**29 Nov 2026, 23:59 IST**, via a Google Form pinned in the Configure Discord
#announcements. Kickoff webinar 27 Nov. Condense workspace setup 26–27 Nov.

## Architecture (do not blur these layers)
`stream adapter → geofence engine → alert rules → dashboard`

- `js/engine.js` — pure geofence engine. No DOM, no timers, no I/O.
  Point-in-polygon (ray casting), haversine distance, circle zones,
  enter/exit state machine, silence detection. Runs in the browser and in
  Node tests unchanged (UMD export at the bottom).
- `js/adapters.js` — stream adapter interface. An adapter is any object with
  `start(onEvent)` and `stop()`. Events are plain objects:
  `{ assetId, kind, lat, lon, ts, speedKph, headingDeg }`.
  - `SampleStreamAdapter` — LOCAL stand-in. Clearly labelled in the UI as a
    sample stream. It mimics the shape expected from the organisers' Condense
    data generator so the swap is a config change, not a rewrite.
  - `CondenseStreamAdapter` — the real hookup point. Config only:
    `{ url, mapEvent }`. Written on 26–27 Nov once the Condense workspace
    shows the actual generator output shape. See `CONDENSE_HOOKUP.md`.
- `js/sampleStream.js` — the sample data generator (routes, assets, one
  asset scripted to go silent). Sample data lives ONLY here and in the
  adapter; never in the engine and never presented as real event data.
- `js/app.js` — dashboard wiring. Canvas schematic map, zone drawing,
  alert feed, asset list. Presentation only; all decisions come from the
  engine.

## Hard rules for this project
- The engine must never contain hardcoded "results". Every alert on screen
  comes from running the engine on stream events.
- The sample stream must stay visibly labelled "SAMPLE STREAM" in the UI
  until the Condense stream is connected.
- Tests: `node tests/engine.test.js` — all must pass. Never edit a test to
  make it pass; fix the engine.
- Copy: plain human words, short sentences. No marketing/AI filler words.
- Motion: transform/opacity only; respect `prefers-reduced-motion` and the
  in-app Reduce motion toggle.
- Every visible control must work (see `qa/INTERACTION_INVENTORY.md`).

## Status
- 23 Nov 2026: platform-independent build (engine, sample adapter, dashboard,
  tests, landing) done and verified locally — 26/26 tests, browser QA green,
  0 console errors. Local git repo committed.
- Deployment BLOCKED on one step: repo creation (connector returns 403).
  See DEPLOY.md for the exact one-minute browser step and what follows it.
- Condense hookup pending 26–27 Nov — see CONDENSE_HOOKUP.md.
