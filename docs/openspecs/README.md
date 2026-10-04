# Neon Dance AR — OpenSpec change set (mobile readiness)

Review of the Phase 1 code on branch `phase-1-web` (commit `1af4895`), written 2026-10-05, to prepare for
serving the app on iOS and Android browsers (Phase 2). Nothing here has been implemented or tested on a device yet.

Layout follows OpenSpec: each folder in `changes/` has

- `proposal.md` — why, what changes, impact
- `tasks.md` — implementation checklist
- `specs/<capability>/spec.md` — requirements with WHEN/THEN scenarios (acceptance criteria)

Related decisions: `docs/adr/0001`–`0004`.

## Implementation order

| # | Change | Depends on | ADR |
|---|---|---|---|
| 1 | [`setup-dev-and-housekeeping`](changes/setup-dev-and-housekeeping/proposal.md) | — | — |
| 2 | [`centralize-app-state`](changes/centralize-app-state/proposal.md) | — | — |
| 3 | [`decouple-inference-loop`](changes/decouple-inference-loop/proposal.md) | 2 | 0001 |
| 4 | [`handle-mobile-lifecycle`](changes/handle-mobile-lifecycle/proposal.md) | 2, 3 | — |
| 5 | [`unify-coordinate-mapping`](changes/unify-coordinate-mapping/proposal.md) | 3 | — |
| 6 | [`improve-instance-tracking`](changes/improve-instance-tracking/proposal.md) | 3, 5 | — |
| 7 | [`add-renderer-landmark-hooks`](changes/add-renderer-landmark-hooks/proposal.md) | 5 | — |
| 8 | [`replace-shadowblur-glow`](changes/replace-shadowblur-glow/proposal.md) | 7 | 0002 |
| 9 | [`mobile-recording-and-sharing`](changes/mobile-recording-and-sharing/proposal.md) | 2 | 0003 |
| 10 | [`pin-and-self-host-dependencies`](changes/pin-and-self-host-dependencies/proposal.md) | — | 0004 |
| 11 | [`add-look-editor`](changes/add-look-editor/proposal.md) — feature, pulled forward from Phase 3 | — (supersedes decorators in 7) | — |

Change 1 comes first because HTTPS is needed to test anything on a phone. Changes 9 and 10 are independent of
3–8 and can be done in any order after 2.

## Full findings report

Severity: **High** = broken behaviour or blocks mobile; **Medium** = visible quality problem or blocks a later
phase; **Low** = cleanup.

### State and control flow

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| S1 | Stopping the camera while recording disables the record button, but the recorder keeps running and can't be stopped. | `js/core/engine.js:38-43`, `js/ui/dom.js:25` | High | 2 |
| S2 | No single app state: camera state is derived from `video.srcObject`, recording/music/background flags live in three different objects, and button labels are set by hand. Invalid combinations aren't prevented. | `camera.js:33`, `recorder.js:5`, `audio.js:4`, `engine.js:20`, `dom.js` | High | 2 |
| S3 | Double-tapping "Start Camera" before `getUserMedia` resolves opens two streams; the first is never stopped. | `engine.js:37-57` | Medium | 2 |
| S4 | "Start Camera" can be clicked while the model is loading; the status text is overwritten, inference silently returns `[]`. | `engine.js:26-28`, `ml.js:20` | Low | 2 |
| S5 | After "Stop Camera", a frame whose `estimatePoses` was in flight is still drawn over the cleared canvas and schedules one more frame. | `engine.js:91-107` | Low | 2 |

### Inference loop

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| I1 | The render loop awaits inference every frame, so preview and recording FPS = inference FPS. On phones this falls below 30. | `engine.js:94` | High | 3 |
| I2 | Model input size isn't bounded (`multiPoseMaxDimension` not set). | `ml.js:12-15` | Medium | 3 |
| I3 | `estimatePoses` is called even before the video has frame data (`readyState < HAVE_CURRENT_DATA`). | `engine.js:94` | Low | 3 |
| I4 | Pose filtering (score > 0.2, sort, top 5) lives in the engine instead of the ML service. | `engine.js:96-100` | Low | 3 |
| I5 | WebGPU (faster) is available on iOS 26 but has a reported video orientation bug; must stay opt-in. | ADR 0001 | Low | 3 |

### Mobile lifecycle and errors

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| L1 | Backgrounding the app / locking the phone isn't handled: camera may stop delivering frames, AudioContext suspends, recording continues. | — | High | 4 |
| L2 | WebGL context loss (common on mobile) is swallowed: every frame logs an error and returns `[]`; no recovery. | `ml.js:23-26` | High | 4 |
| L3 | Camera track ending (another app takes the camera, permission revoked) isn't detected. | `camera.js` | Medium | 4 |
| L4 | Canvas is sized once at camera start; rotating the phone changes video dimensions but the canvas isn't resized. | `engine.js:48`, `renderer.js:9` | Medium | 4 |
| L5 | `camera.start()` never rejects if metadata doesn't load; `video.play()` promise isn't awaited or caught; every error is reported as "Camera access denied". | `camera.js:14-22`, `engine.js:53-56` | Medium | 4 |

### Coordinates

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| C1 | No single coordinate mapping (model input → video → canvas). Keypoints are drawn in raw video pixels, which breaks once input is downscaled, mirrored or rotated. | `renderer.js`, `tracker.js` | Medium | 5 |
| C2 | Front camera preview isn't mirrored (selfie view feels reversed). Whether recordings should be mirrored is an open question. | `renderer.js:16`, `camera.js:10` | Medium | 5 |
| C3 | Tracker match distance is a fixed 100 px, so it means different things at different resolutions and person sizes. | `config.js:16`, `tracker.js:25` | Medium | 5/6 |

### Tracking

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| T1 | Likely double smoothing/tracking: pose-detection's MoveNet defaults (`enableSmoothing`, `enableTracking`) are left on and our One Euro filter + tracker run on top, adding lag. Verify defaults for the pinned version. | `ml.js:12-15` | Medium | 6 |
| T2 | Matching is greedy in the order of the old instance list, not globally nearest-first; IDs swap when people cross. | `tracker.js:15-30` | Medium | 6 |
| T3 | A pose with no confident keypoints gets bbox centre `(0,0)` and can match anyone near the top-left corner. | `tracker.js:92` | Medium | 6 |
| T4 | Colour = `nextId % 8` after incrementing: first person is magenta (not cyan) and two people on screen can share a colour. | `tracker.js:69` | Medium | 6 |
| T5 | Unmatched people are still drawn at their last position for 30 frames (~1 s "frozen ghost"). | `tracker.js:44-47` | Medium | 6 |
| T6 | Low-confidence keypoint positions are fed into the One Euro filters and pull smoothed joints off course. | `tracker.js:37-41` | Low | 6 |
| T7 | Tracker reads `performance.now()` itself, so it can't use the estimation timestamp (needed by change 3) and is hard to test. | `tracker.js:11` | Low | 6 |

### Rendering

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| R1 | No per-landmark override hook, which `CLAUDE.md` requires now for Phase 3. | `renderer.js:23-58` | Medium | 7 |
| R2 | The face circle is hard-coded into the skeleton loop instead of being a pluggable decoration. | `renderer.js:53, 60-78` | Low | 7 |
| R3 | `shadowBlur` on ~170 draw calls per frame (5 people) is a known slow path, worst on iOS Safari. | `renderer.js:27` | High | 8 |

### Audio and recording

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| A1 | Audio track is only added if music is already playing when recording starts; music started later isn't recorded. | `engine.js:81` | High | 9 |
| A2 | Safari can produce empty MP4s from `canvas.captureStream()` with no audio track (WebKit bug 290002). | `recorder.js:13-17` | High | 9 |
| A3 | WebM is preferred; iOS < 18.4 can only record MP4, and MP4 is what galleries/social apps handle best. | `recorder.js:18-20` | High | 9 |
| A4 | File is always named `.webm`, even when MP4 was recorded. | `recorder.js:46` | Medium | 9 |
| A5 | `<a download>` on iOS saves to Files, not Photos; object URL is revoked synchronously after `click()`, which can break the download. | `recorder.js:38-50` | High | 9 |
| A6 | `captureStream(30)` hard-codes FPS instead of using `CONFIG.CAMERA.FPS`. | `recorder.js:10` | Low | 9 |
| A7 | The whole recording is kept in memory (100 ms chunks); long takes may hit memory limits on phones. | `recorder.js:23-27` | Low | 9 (open question) |
| A8 | iPhone silent switch can mute Web Audio playback; `navigator.audioSession.type = 'playback'` (Safari 16.4+) should prevent it — unverified. | `audio.js:10-23` | Medium | 9 |

### Dependencies

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| D1 | TF.js and pose-detection loaded from CDN without versions; any upstream release can break the app. | `index.html:8-11` | High | 10 |
| D2 | Model weights fetched from Google at runtime; the PWA can't work offline. | `ml.js:12` | Medium | 10 |
| D3 | The four TF.js scripts are render-blocking in `<head>`. | `index.html:8-11` | Low | 10 |
| D4 | `assets/music.mp3` is ~8.9 MB; heavy to download/pre-cache on cellular. | `assets/music.mp3` | Low | 10 (open question) |

### Dev environment and housekeeping

| ID | Finding | Where | Sev | Change |
|---|---|---|---|---|
| H1 | `make run` serves plain HTTP; phones only allow camera access over HTTPS (localhost excepted). | `Makefile:7-9` | High | 1 |
| H2 | Spec file is `Claude.md`; case-sensitive systems and tools expect `CLAUDE.md`. | repo root | Low | 1 |
| H3 | Stale comment says `music.mp3` must be added, but it's committed. | `index.html:31-32` | Low | 1 |
| H4 | `start-claude.sh` appeared as untracked in git status but isn't on disk. No action unless it reappears. | repo root | Low | — |
| H5 | No tests; `OneEuroFilter` and `InstanceTracker` are pure enough to unit-test once time is injected (T7). | `js/logic/` | Low | 6 |
