# CONDENSE HOOKUP — what remains on 26–27 Nov

GeoRaksha is built and verified on a local sample stream. Everything below
is the event work. Nothing else in the codebase needs to change.

**Event facts:** Configure 2026 (Bosch) · Team **CFG-5RZN** · Problem
statement **"Geofencing and Real-Time Alerts"** · Workspace setup 26 Nov ·
Kickoff webinar 27 Nov · **Filing deadline 29 Nov 2026, 23:59 IST** via the
Google Form pinned in the Configure Discord **#announcements**.

---

## Step 1 — Condense workspace (26 Nov)
- [ ] Sign in to the Condense workspace the organisers assign to CFG-5RZN.
- [ ] Find the data generator / stream for the geofencing problem statement.
- [ ] Note exactly how the stream is delivered. One of these three:
  - WebSocket URL (ws:// or wss://), or
  - Server-sent events URL (http/https), or
  - A pipeline step inside Condense that our code runs within (in that
    case, the engine file `js/engine.js` is the piece that runs there —
    it has no DOM or browser dependency and also runs in Node).
- [ ] Capture **one raw sample message** from the generator, exactly as it
  arrives, and paste it into Step 3 below before writing any mapping code.

## Step 2 — Confirm the generator's event shape
The engine eats events of this shape:

```json
{ "assetId": "VAN-01", "kind": "vehicle", "lat": 12.97001, "lon": 77.59002,
  "ts": 1732700000000, "speedKph": 32, "headingDeg": 90 }
```

Only `assetId`, `lat`, `lon`, `ts` are required. Write down the generator's
actual field names here once seen (do not guess them beforehand):

| Our field | Generator's field | Notes |
|---|---|---|
| assetId | _(fill in at the event)_ | |
| lat | | |
| lon | | |
| ts | | epoch ms? seconds? ISO string? |
| speedKph | | optional |
| headingDeg | | optional |

Also confirm: update rate per asset (events/second), how many assets the
generator emits, and whether asset IDs are stable across the session.

## Step 3 — Plug the stream in (the only code change)
In `js/app.js`, the block marked `STREAM_CONFIG`:

```js
var STREAM_CONFIG = {
  source: 'condense',              // was 'sample'
  url: 'wss://…',                  // from Step 1
  mode: 'ws',                      // or 'sse'
  mapEvent: function (raw) {       // translate ONE raw message
    return {
      assetId: String(raw.<id field>),
      kind: 'vehicle',
      lat: Number(raw.<lat field>),
      lon: Number(raw.<lon field>),
      ts: Number(raw.<ts field>), // convert if it is seconds or ISO
      speedKph: raw.<speed field> != null ? Number(raw.<speed field>) : null,
      headingDeg: null
    };
  }
};
```

`js/adapters.js` (`CondenseStreamAdapter`) already handles the socket,
JSON parsing, malformed messages and error surfacing. If the workspace
turns out to be a pipeline the code runs inside (not a socket), skip the
adapter: feed generator rows straight into `GeoEngine.createMonitor(...)`
with `.ingest(event)` and `.checkSilence(now)` — the same calls the
dashboard makes.

## Step 4 — Verify on the real stream (before filing)
- [ ] Header chip reads **"Source: Condense stream"** and the SAMPLE label
  is gone. If it still says sample, the config did not change — stop.
- [ ] Assets move on the map from generator positions (not sample routes).
- [ ] Draw one zone over a route the generator actually uses → ENTER and
  EXIT alerts fire from real events.
- [ ] Silence check: if the generator lets an asset pause, confirm a
  SILENCE alert; otherwise leave the silence limit at 20 s and note in the
  filing that silence was verified on the sample stream + automated tests.
- [ ] `node tests/engine.test.js` and `node tests/pipeline.test.js` still
  pass (26/26). The engine did not change, so they must.

## Step 5 — File (29 Nov, before 23:59 IST)
Submission is the Google Form pinned in Discord #announcements. Expect to
need (have these ready in one note before opening the form):
- Team ID: **CFG-5RZN**
- Problem statement: **Geofencing and Real-Time Alerts**
- Project name: **GeoRaksha**
- Live URL: _(the deployed URL — see README.md)_
- GitHub repo: _(repo URL — see README.md)_
- Demo video: record from the **live deployed** page after the Condense
  hookup, showing a real crossing and an alert. Not recorded yet — the
  sample-stream page must not be passed off as the event build.
- A short description: use the README's opening paragraph, plain words.

## If something differs at the event
- Generator emits **zones** too, or expects zones pushed to it → note the
  format here and add the push inside `CondenseStreamAdapter.start()`.
- The problem statement's data is **not** vehicle positions → the engine
  only needs `{assetId, lat, lon, ts}`; anything with a place and a time
  works. People, phones and machines are all "assets" to the engine.
- No live socket at all, only a file/feed → write a tiny adapter with the
  same `start(onEvent)` / `stop()` interface; nothing else changes.
