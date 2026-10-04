# ADR 0001 — Pose model and inference loop on mobile

- **Status:** Proposed
- **Date:** 2026-10-05

## Context

The app must run in mobile browsers (iOS Safari, Android Chrome) at 30 FPS while tracking up to 5 people.
Phase 1 runs MoveNet MultiPose Lightning on the TF.js WebGL backend, and the render loop `await`s
`estimatePoses()` before drawing each frame (`js/core/engine.js`). On a desktop GPU that is fine; on a phone,
inference time directly caps the preview and recording frame rate, and a slow frame stalls the whole UI.

Options considered for the model:

| Option | Multi-person cost | Notes |
|---|---|---|
| MoveNet MultiPose Lightning (TF.js) — current | Single pass, constant for 1–6 people | Fits the 5-person requirement. TF.js release cadence has slowed; pin the version (see ADR 0004). |
| MediaPipe Pose Landmarker (Tasks Vision) | Detector + one landmark pass per person | Actively maintained, 33 landmarks, but cost grows with each extra person. |
| TF.js WebGPU backend | Same model | Shipped in Safari 26 / iOS 26, but there is a reported iOS 26 bug where video frames imported through WebGPU have the wrong orientation (tfjs#8733). |

## Decision

1. **Keep MoveNet MultiPose Lightning on TF.js WebGL** as the default for Phase 2. Its single-pass multi-person cost
   is the best fit for "up to 5 people at 30 FPS" on phones.
2. **Decouple inference from rendering.** The `requestAnimationFrame` loop draws every frame using the latest
   tracked poses; inference runs in its own loop and starts the next estimate only when the previous one resolves.
   The renderer never awaits the model.
3. **Bound the model input size** with MoveNet's `multiPoseMaxDimension` (multiple of 32, default 256), kept in
   `config.js`, so it can be lowered on slow devices instead of downscaling the camera itself.
4. **WebGPU is opt-in, not default.** Try `tf.setBackend('webgpu')` only behind a config flag after the iOS orientation
   bug is verified fixed on real devices; fall back to WebGL on any failure.

## Consequences

- Preview and recording stay at display rate even when inference runs at, say, 15–20 Hz; skeletons update at the
  inference rate, and the One Euro filter keeps motion smooth between updates.
- The tracker's timestamps must come from when the poses were *estimated*, not when they are drawn.
- If on-device benchmarks show MoveNet MultiPose can't hold ~15 Hz inference with 5 people on mid-range phones,
  revisit with MediaPipe Pose Landmarker (would also change the 17-keypoint topology in `config.js`).
- `CLAUDE.md` "Threading & Concurrency" and Phase 1 Step 3 should be updated to describe the decoupled loop.
