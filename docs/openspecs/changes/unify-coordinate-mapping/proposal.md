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
  (e.g. `MAX_DISTANCE_RATIO = 0.5`) instead of fixed pixels. (Implemented in `improve-instance-tracking`; defined here.)

## Open question
Should the **recorded** video be mirrored like the preview? The default here is "yes, WYSIWYG", because the recording
is a capture of the canvas. Confirm before implementing.

## Impact
- Affected specs: `coordinate-mapping`
- Affected code: `js/ui/renderer.js`, `js/config.js`, new `js/logic/coords.js` (if chosen)
