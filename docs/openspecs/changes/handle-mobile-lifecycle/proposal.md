# Change: Handle mobile lifecycle and errors

## Why
On phones the page is backgrounded, the screen locks, the GPU context is reclaimed, the camera is taken by another
app and the device rotates. None of this is handled today:

- L1: no `visibilitychange` handling; recording continues while the camera/audio are suspended.
- L2: WebGL context loss is swallowed in `ml.js:23-26`; every frame returns `[]` forever.
- L3: camera track `ended` isn't detected.
- L4: canvas is sized once (`engine.js:48`); rotation changes the video size.
- L5: `camera.start()` can hang (`camera.js:14-22`); `video.play()` isn't awaited; all errors show "Camera access denied".

## What Changes
- **Page hidden:** stop recording (export the file), pause music, pause the inference loop.
  **Page visible:** resume the `AudioContext` if music was on; if the camera track has ended, set camera state to
  `off` with a status message; otherwise resume inference.
- **Camera track `ended`:** move to camera `off`, stop recording, show "Camera disconnected".
- **Inference failure recovery:** after N consecutive `estimatePoses` failures (config, e.g. 5), dispose the
  detector, re-run `init()`, show "Recovering…"; if re-init fails, show an error and set model state to `error`.
- **Resize:** listen to the video `resize` event and resize the canvas to the new `videoWidth`/`videoHeight`.
- **Camera start:** await `video.play()`; reject on a metadata timeout (e.g. 5 s); map `NotAllowedError`,
  `NotFoundError`, `NotReadableError`, `OverconstrainedError` to distinct status messages.

## Impact
- Affected specs: `app-lifecycle`
- Affected code: `js/core/engine.js`, `js/services/camera.js`, `js/services/ml.js`, `js/services/audio.js`, `js/config.js`
- Depends on `centralize-app-state` (state transitions) and `decouple-inference-loop` (separate inference loop).
