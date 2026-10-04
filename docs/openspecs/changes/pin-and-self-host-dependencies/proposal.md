# Change: Pin and self-host TF.js and the MoveNet model

See `docs/adr/0004-pin-and-self-host-dependencies.md`.

## Why
- D1: TF.js and pose-detection are loaded from jsDelivr without versions (`index.html:8-11`); any upstream release
  can change behaviour or break the app.
- D2: MoveNet weights are fetched from Google at runtime (`ml.js:12`), so the PWA can't work offline.
- D3: the four scripts are render-blocking in `<head>`.

## What Changes
- Choose and record exact versions of `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`,
  `@tensorflow/tfjs-backend-webgl`, `@tensorflow-models/pose-detection` (and `@tensorflow/tfjs-backend-webgpu` if
  `decouple-inference-loop` enables it).
- Add a `make vendor` target that downloads those builds into `vendor/` and the MoveNet MultiPose Lightning model
  (`model.json` + weight shards) into `models/movenet-multipose-lightning/`.
- `index.html` loads scripts from `vendor/` with `defer` (module `app.js` still runs after them).
- `createDetector` receives `modelUrl: 'models/movenet-multipose-lightning/model.json'`.
- The Phase 2 service worker will pre-cache `vendor/` and `models/` (service worker itself is out of scope here).

## Open question
D4: `assets/music.mp3` is ~8.9 MB. Should it be re-encoded smaller or excluded from pre-caching? Not included unless confirmed.

## Impact
- Affected specs: `dependencies`
- Affected code: `index.html`, `js/services/ml.js`, `Makefile`, new `vendor/`, `models/`
- `CLAUDE.md` Phase 1 Step 1 must be updated.
