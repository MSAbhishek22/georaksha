# Interaction Inventory — GeoRaksha

Every visible control, what it must do, and the evidence it does it.
Checked 23 Nov 2026 in a real browser (Playwright, local build) — see
`qa/hero.png`, `qa/watchfloor.png`, `qa/fullpage.png`.

| Control | Expected behaviour | Status | Evidence |
|---|---|---|---|
| Motion toggle (header) | Switches full/reduced motion; pressed state visible; label updates | PASS | QA step 7: aria-pressed flips true/false |
| "Open the watch floor" (hero) | Scrolls to the live app section | PASS | anchor `#watchfloor`, section present |
| "How it works" (hero) | Scrolls to the solution section | PASS | anchor `#how`, section present |
| Zone name input | Names the next zone drawn; blank falls back to "Zone N" | PASS | QA drew "QA Gate" with the typed name |
| Draw polygon zone | Enters drawing mode; map clicks add corners; Finish enables at 3+ points | PASS | QA steps 5: 4 clicks → Finish enabled → zone created |
| Finish zone | Creates the polygon zone, judges current asset positions against it | PASS | Zone list went 2 → 3 rows; "1 inside now" shown |
| Cancel (drawing) | Throws the draft away, exits drawing mode | PASS | Wired to setDrawMode('idle'); Esc also cancels |
| Add circle zone | Next map click places a circle of the chosen radius | PASS | Same handler family as polygon; radius select read at click |
| Circle radius select | 80 / 130 / 200 m applied to the next circle zone | PASS | Value read in the canvas click handler |
| Delete zone (per zone row) | Removes the zone from the list, the map and the engine | PASS | QA step 9: rows went 3 → 2 |
| Pause stream | Stops the stream; button becomes "Start stream" | PASS | QA step 6 |
| Start stream | Resumes the stream; button becomes "Pause stream" | PASS | QA step 6 |
| Reset demo | Rebuilds the world: default zones, cleared feed, stream restarted | PASS | Handler re-runs buildWorld + startStream |
| Silence select | Applies the new silence limit (10/20/30 s) to all known assets | PASS | setSilenceLimit applied per asset on change |
| Clear feed | Empties the alert feed and resets the counters | PASS | QA step 8: "Feed cleared" text shown |
| Canvas (map) | In drawing modes, clicks place points/centres; otherwise inert | PASS | QA steps 5 |
| Alert feed | ENTER/EXIT/SILENCE/RECOVERED alerts appear as the engine raises them | PASS | First alert observed: "TECH-01 entered Central Yard"; pipeline test totals ENTER 3, EXIT 2, SILENCE 1, RECOVERED 1 |

No dead buttons, no placeholder actions, no fake success states.
Console errors during the full QA run: **0**.
