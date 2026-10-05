# Change: Replace per-stroke shadowBlur with a downscaled glow layer

See `docs/adr/0002-glow-rendering-without-shadowblur.md`.

## Why
R3: `ctx.shadowBlur` is set for every bone, joint and face circle (`renderer.js:27`), about 170 blurred draw calls per
frame with 5 people. Canvas shadow blur is a known slow path in WebKit and the cost grows with people × bones,
competing with inference for the 30 FPS budget on phones.

## What Changes
- Add an offscreen glow canvas at `CONFIG.RENDER.GLOW_SCALE` (e.g. 0.25) of the output size. Tuned to 0.125 with `GLOW_LINE_WIDTH` 12 and a new `GLOW_ALPHA` 0.3 to match the old halo; 0.25 is the fallback if iOS shows blockiness.
- Per frame: clear the glow canvas → draw all visible skeletons (bones + joints, decorators too) with
  `GLOW_LINE_WIDTH` (scaled) → draw the glow canvas onto the main canvas upscaled with `'lighter'` (with
  `imageSmoothingEnabled = true`) → draw the crisp skeletons on top with `'lighter'`, `LINE_WIDTH`, no shadow.
- Landmark overrides (Phase 3 assets) are drawn only in the crisp pass.
- Remove `GLOW_BLUR` and every `shadowBlur` / `shadowColor` use.
- Resize the glow canvas whenever the main canvas resizes.

## Impact
- Affected specs: `skeleton-rendering`
- Affected code: `js/ui/renderer.js`, `js/config.js`
- `CLAUDE.md` Phase 1 Step 6 and "Rendering → Glow Effect" must be updated.
