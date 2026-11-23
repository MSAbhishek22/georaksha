# GeoRaksha — Design Constitution

Written before the frontend build, per Blueprint Part V. References are the
user's own set; only patterns were taken, nothing copied.

## References inspected (23 Nov 2026, from the user's supplied set)
| Reference | Pattern taken | Not copied |
|---|---|---|
| dark.design / darkmodedesign.com | Dark control-room surfaces, one accent colour doing the alerting work, quiet chrome around loud data | Their layouts and artwork |
| minimal.gallery | Generous spacing, one idea per section, type doing the hierarchy work | Specific page compositions |
| land-book.com / onepagelove.com | Landing order: hook → problem → how it works → the product itself → proof | Their copy and imagery |
| 21st.dev / Skiper UI | Component discipline: small radius scale, consistent borders, clear hover/focus states | Component code |
| gsap.com | Motion feel: short, eased, transform/opacity only; nothing bounces or spins for decoration | Their demos |
| threeui.com / tasteskill.dev | Spatial panel depth done with light and shadow, not heavy 3D libraries | Their scenes |

## Identity — "the night control room"
GeoRaksha is a watch floor at night. Deep ink background, a schematic street
map drawn like a radar plot (the map IS the spatial feature — zones and moving
assets live on it, and the user draws on it), one signal colour for danger.

- **Visual metaphor:** radar / watch-floor plot, not a generic admin panel.
- **Palette:** ink `#0b0e13`, panel `#12161f`, line `rgba(255,255,255,.09)`,
  text `#e8e6df`, muted `#9a97a3`; amber `#f2b33d` = attention,
  red `#e5484d` = breach/silence, teal `#2dd4bf` = inside/safe.
- **Type scale (fixed, 7 sizes):** 12 / 14 / 16 / 20 / 24 / 32 / 44 px.
  Serif display for headlines (Georgia), system sans for UI, mono for data.
- **Radius scale:** 4 / 8 / 16 px (+ 50% for dots).
- **Layout:** landing sections stacked; the app is a three-column watch
  floor (zones + assets | map | alert feed) that stacks on small screens.
- **Motion:** 160–280 ms ease-out reveals and hovers, transform/opacity
  only. Map markers move because the data moves, not as decoration.
  `prefers-reduced-motion` and the Reduce motion toggle stop all of it.
- **Distinct from the fleet:** Verity is a light-paper research instrument
  turned dark glass with a score dial; GeoRaksha is a radar plot with a
  drawn street grid and a live alert rail. Different metaphor, different
  layout, different motion (data-driven, not reveal-driven).

## Rules that bind every change
1. Nothing below 12 px text. Body copy 16 px.
2. Interactive controls must look different from static labels (border +
   hover + pressed state).
3. Every button on the page works or is removed. No placeholder actions.
4. The sample stream is always labelled SAMPLE STREAM until Condense is in.
5. Footer text capped at ~68 characters per line.
