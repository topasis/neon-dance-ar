# Tasks

- [ ] 1.1 Add a `state` object to `AppEngine` with `model`, `camera`, `recording`, `music`, `showCameraFeed`.
- [ ] 1.2 Replace `setCameraActive` / `setBackgroundLive` / `setMusicPlaying` / `setRecordingActive` in `dom.js` with
      one `render(state)` method; remove the now-unused setters.
- [ ] 1.3 Set `model` to `'loading'` → `'ready'` / `'error'` around `detector.init()`; disable the camera button until ready.
- [ ] 1.4 In `toggleCamera`, ignore taps while `camera === 'starting'`; set `'starting'` before `getUserMedia`.
- [ ] 1.5 When stopping the camera, stop recording first if active.
- [ ] 1.6 Add a loop generation counter; `renderLoop` exits (without drawing) if the generation changed while awaiting.
- [ ] 1.7 Manually verify every scenario in `specs/app-state/spec.md`.
