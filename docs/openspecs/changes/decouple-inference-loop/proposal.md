# Change: Decouple inference from rendering

See `docs/adr/0001-pose-model-and-inference-loop-on-mobile.md`.

## Why
- I1: `renderLoop` awaits `estimatePoses` every frame (`engine.js:94`), so preview and recording frame rate equal
  inference rate. On phones that drops below the 30 FPS target.
- I2: model input size isn't bounded (`ml.js:12-15`).
- I3: inference is attempted before the video has frame data.
- I4: pose filtering (score, sort, top 5) lives in the engine (`engine.js:96-100`).
- I5: WebGPU is faster on iOS 26 but has a reported video orientation bug.

## What Changes
- Two loops:
  - **Render loop** (`requestAnimationFrame`): draws the background and the latest tracked instances every frame; never awaits.
  - **Inference loop**: runs `estimatePoses`; when it resolves, filters poses, updates the tracker with the
    timestamp captured *before* the estimate started, stores the result, and immediately starts the next estimate.
- Skip inference while `video.readyState < HAVE_CURRENT_DATA`.
- Move score filtering / sort / top-N into `PoseDetector.estimatePoses()` so it returns ready-to-track poses.
- Add `CONFIG.MODEL.MAX_DIMENSION` (default 256, multiple of 32) passed as `multiPoseMaxDimension`.
- Add `CONFIG.MODEL.BACKEND` (`'webgl'` default, `'webgpu'` opt-in) with fallback to WebGL if WebGPU init fails.
- Show inference rate and render rate in the status line (or a debug overlay) to verify on device.

## Impact
- Affected specs: `pose-inference`
- Affected code: `js/core/engine.js`, `js/services/ml.js`, `js/config.js`, `index.html` (only if the WebGPU backend script is added)
- `CLAUDE.md` "Threading & Concurrency" and Phase 1 Step 3 must be updated to describe two loops.
