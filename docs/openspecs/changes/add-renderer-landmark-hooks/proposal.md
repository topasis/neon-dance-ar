# Change: Add per-landmark override hooks to the renderer

> **Superseded in part by `add-look-editor` (11):** decorators (`addDecorator`, `drawFaceCircle`) were removed. The
> face circle is now an item of the Classic look, and each person is drawn with a look. Landmark overrides remain,
> drawn crisp-only on top of the look, until an `image` item type replaces them.

## Why
- R1: `CLAUDE.md` (Phase 3 → Rendering Integration) requires the Phase 1 renderer to expose a per-landmark override
  hook so Phase 3 can draw assets with `ctx.translate` / `ctx.rotate` without touching inference. It doesn't exist.
- R2: the face circle is hard-coded in the skeleton loop (`renderer.js:53, 60-78`). Each new decoration would be
  added the same way.

## What Changes
- Split `renderSkeletons` into fixed passes per instance: bones → joints → decorators.
- **Landmark overrides:** `renderer.setLandmarkOverride(index, drawFn)` / `clearLandmarkOverride(index)`. When an
  override exists for a keypoint, the renderer does `ctx.save(); ctx.translate(x, y); drawFn(ctx, keypoint, instance); ctx.restore()`
  instead of drawing the joint circle. Coordinates are already canvas-mapped (see `unify-coordinate-mapping`).
- **Decorators:** `renderer.addDecorator(drawFn)` — called once per instance after joints with
  `(ctx, instance, color, map)`. The face circle becomes the first decorator (behaviour unchanged).
- No Phase 3 assets are added; this only provides the extension points.

## Impact
- Affected specs: `skeleton-rendering`
- Affected code: `js/ui/renderer.js` (face circle moves into a decorator, possibly `js/ui/decorators.js`)
