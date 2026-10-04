# Change: Centralize app state and gate controls

## Why
App state is spread across five places: camera state is derived from `video.srcObject` (`camera.js:33`), and
`recorder.isRecording`, `audio.isPlaying` and `engine.showCameraFeed` are independent flags. Buttons are updated by
hand in `dom.js`. Nothing prevents invalid combinations, which causes:

- S1: stopping the camera while recording disables the record button (`dom.js:25`) while the recorder keeps running.
- S3: a double tap on "Start Camera" opens two camera streams (`engine.js:37-57`).
- S4: "Start Camera" is usable while the model is still loading.
- S5: after stopping, an in-flight frame is drawn over the cleared canvas (`engine.js:91-107`).

## What Changes
- The engine owns one state object, e.g.
  `{ model: 'loading'|'ready'|'error', camera: 'off'|'starting'|'on', recording: bool, music: bool, showCameraFeed: bool }`.
- All transitions go through engine methods that update state and then call a single `dom.render(state)` which sets
  every button's label, active class and `disabled` flag from state.
- Button rules:
  - Camera button disabled while `model !== 'ready'` or `camera === 'starting'`.
  - Record button enabled only when `camera === 'on'`.
- Stopping the camera while recording stops the recording first (and the file is still exported).
- The render loop uses a run token/generation counter so a frame that resolves after stop is discarded.

## Impact
- Affected specs: `app-state`
- Affected code: `js/core/engine.js`, `js/ui/dom.js`, `js/services/camera.js` (no longer the source of truth)
- Foundation for `handle-mobile-lifecycle` and `mobile-recording-and-sharing`.
