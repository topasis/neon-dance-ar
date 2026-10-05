# Change: Unify coordinate mapping and mirror the front camera

## Why
- C1: keypoints are in video pixels and drawn directly on a canvas assumed to be the same size. This breaks as soon
  as the input is downscaled (`decouple-inference-loop`), the preview is mirrored, the device rotates
  (`handle-mobile-lifecycle`) or Phase 3 overlays are added.
- C2: the front camera preview isn't mirrored, so the selfie view feels reversed while dancing.
- C3: the tracker's `MAX_DISTANCE_PX = 100` (`config.js:16`) is resolution- and person-size-dependent.

## What Changes
- Add one mapping function/object (e.g. `js/logic/coords.js` or a method on `Renderer`) that converts model/video
  coordinates into canvas coordinates, including horizontal mirroring. The renderer is the only consumer; the
  tracker keeps working in video coordinates.
- The background video is drawn mirrored with the same transform when mirroring is on, so skeleton and video always line up.
- Add `CONFIG.CAMERA.MIRROR_FRONT = true`. Mirroring applies to the user-facing camera only (Phase 2 adds the rear camera).
- Express the tracker's match threshold relative to the instance's bounding-box diagonal
  (e.g. `MAX_DISTANCE_RATIO = 0.5`) instead of fixed pixels. (Delivered by `improve-instance-tracking`; its
  requirement now lives in that change's `instance-tracking` spec delta.)

## Open question
Should the **recorded** video be mirrored like the preview? The default here is "yes, WYSIWYG", because the recording
is a capture of the canvas. Confirm before implementing.

**Resolved:** the user confirmed recordings are mirrored like the preview (WYSIWYG). The recorder captures the
canvas, so no recorder change is needed.

## Implementation notes
- The mapping lives in `js/logic/coords.js` (`CoordinateMapping`): `mapPoint(x, y)` plus `scaleX`, `scaleY`,
  `mirrored` and `canvasWidth`. The engine calls `Renderer.updateMapping(video)` at the start of every render frame
  (before any drawing), and the renderer maps every keypoint through it. Points are mapped individually instead of drawing under a mirrored
  canvas transform, so line widths, radii and future Phase 3 assets stay in plain canvas pixels and aren't flipped,
  and landmark overrides, the glow pass and the look editor's reflection check get on-screen coordinates.
- Only the background video uses a canvas transform (`translate(width, 0); scale(-1, 1)`, composed onto any base
  transform), which flips it the same way as `mapPoint()`.
- Mirroring applies when `MIRROR_FRONT` is true and `Renderer.facingMode === 'user'` (always, until Phase 2 adds the
  rear camera and updates `facingMode`).
- `MAX_DISTANCE_RATIO` is not added here. `improve-instance-tracking` (task 1.5) replaces `MAX_DISTANCE_PX` with it
  and wires it into the tracker, which keeps working in video coordinates. The "Resolution-independent matching
  distance" requirement was moved into that change's spec delta.

## Impact
- Affected specs: `coordinate-mapping`
- Affected code: `js/ui/renderer.js`, `js/config.js`, new `js/logic/coords.js` (if chosen)
