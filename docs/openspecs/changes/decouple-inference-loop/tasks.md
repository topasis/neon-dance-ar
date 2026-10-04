# Tasks

- [ ] 1.1 Add `CONFIG.MODEL = { MAX_DIMENSION: 256, BACKEND: 'webgl' }`.
- [ ] 1.2 Pass `multiPoseMaxDimension: CONFIG.MODEL.MAX_DIMENSION` to `createDetector` (`ml.js:12-15`).
- [ ] 1.3 Backend selection: try `CONFIG.MODEL.BACKEND`, fall back to `'webgl'` on failure. If `'webgpu'` is used,
      load `@tensorflow/tfjs-backend-webgpu` (pinned, see `pin-and-self-host-dependencies`).
- [ ] 1.4 Move score filter / sort / top-N from `engine.js:96-100` into `PoseDetector.estimatePoses()`.
- [ ] 1.5 Guard: return `[]` without calling the model if `video.readyState < 2`.
- [ ] 1.6 Split `renderLoop` into `renderLoop` (rAF, sync draw of `this.latestInstances`) and `inferenceLoop`
      (async, one estimate at a time, uses the generation counter from `centralize-app-state`).
- [ ] 1.7 Capture `t = performance.now()` before each estimate and pass it to `tracker.update(poses, t)`.
- [ ] 1.8 Add measured render FPS and inference Hz to the status line.
- [ ] 1.9 Update `CLAUDE.md` (Threading & Concurrency, Phase 1 Step 3).
- [ ] 1.10 Verify on a mid-range Android phone and an iPhone: render ≥ 30 FPS with 1 and with 3+ people.
