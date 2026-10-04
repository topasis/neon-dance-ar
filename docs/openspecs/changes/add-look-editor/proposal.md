# Change: Add customizable looks (shapes on landmarks) with a body editor

## Why
- The neon stick figure is the only look. The reference videos for the trend use many styles: glow sticks
  with a different color per bone, costumes made of separate shapes (glasses, a chest circle, knee circles, a belt),
  and EL-wire suits that outline the body with a hat.
- Users want to make their own look: place ready-made shapes or draw freehand on a full-body figure, and give each
  person on camera a different look.
- Product decision (2026-10-05): this is pulled forward from Phase 3 and built on `feat/make-first-stable-version`.
  Geometric shapes and freehand strokes are in scope now. Premium image assets (SVG/PNG) stay in Phase 3.

## What Changes
- **Look:** a list of items placed on a fixed reference body (the *model pose*). Item types:
  - basic shapes: `circle`, `rect`, `triangle`, `line`
  - ready-made shapes: `glasses`, `hat`, `smile`
  - `stroke`: a freehand polyline
  Each item has a position, scale, rotation and an optional fixed color. Without a color it uses the person's
  neon color.
- **Attaching to the body:** shapes are anchored to the nearest bone of the model pose. Each point of a freehand
  stroke is anchored to its own nearest bone, so the stroke bends at elbows and knees. At render time each bone's
  model→live transform (rotation + uniform scale + translation) maps the item onto every tracked person.
- **Body editor:** a full-screen editor that shows the model pose. It has a palette of shapes, a pen for freehand
  drawing, select/move, and per-item scale, rotation, color and delete controls. Presets can be loaded as a
  starting point.
- **Per-person looks:** five slots (Person 1–5). A slot with a custom look uses it. A slot without one uses the
  **default look** (the current skeleton plus head ring) in that person's auto-assigned neon color.
- **Presets:** Classic (the default), Glow Sticks, Party, EL Suit. They are stored as data in the same format the
  editor produces. They aren't hand-coded draw functions.
- **Persistence:** per-person looks are saved in `localStorage`.
- **Tracker:** each tracked instance gets a stable `slot` (0–4).
- `CLAUDE.md`: add the look system to Phase 1 scope. Narrow Phase 3 to premium image assets.

## Impact
- Affected specs: `looks` (new)
- New code: `js/logic/rig.js`, `js/ui/looks.js`, `js/ui/editor.js`, `js/services/storage.js`
- Changed code: `js/config.js`, `js/ui/renderer.js`, `js/core/engine.js`, `js/ui/dom.js`, `js/logic/tracker.js`,
  `index.html`, `style.css`, `CLAUDE.md`
- Related changes:
  - `add-renderer-landmark-hooks` (7): its decorator idea is replaced by looks. The face circle becomes an item
    in the Classic preset. The per-landmark override hook for Phase 3 image assets can later become an `image`
    item type.
  - `replace-shadowblur-glow` (8): items must be drawn through whatever glow pipeline is in place. Item drawing
    produces paths only, so it isn't tied to `shadowBlur`.
  - `improve-instance-tracking` (6): the tracker rewrite must keep the `slot` field.
  - `unify-coordinate-mapping` (5): a mirrored preview turns the body into its mirror image. Rendering handles this
    with the reflection check in `design.md`.
