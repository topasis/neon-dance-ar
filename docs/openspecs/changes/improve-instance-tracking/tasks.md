# Tasks

- [x] 1.1 Check pose-detection's MoveNet defaults for `enableSmoothing` / `enableTracking` in the pinned version.
      Finding (vendored `vendor/pose-detection.min.js`, 2.1.3): MoveNet sets `enableSmoothing = true` when it's
      unset, and `enableTracking = true` when it's unset and the model is `MultiPose.Lightning` (BoundingBox tracker).
      For MultiPose the library's keypoint smoothing runs only when tracking is on. So with the old options, keypoints
      were smoothed twice and people tracked twice, as T1 suspected. Also: `minPoseScore` defaults to 0.25, so the
      library already drops poses below 0.25 and our `MIN_INSTANCE_SCORE` (0.2) filter currently never removes anything.
- [x] 1.2 Pass `enableSmoothing: false, enableTracking: false` to `createDetector`.
- [x] 1.3 Change `InstanceTracker.update(poses)` → `update(poses, timestamp)`; remove `performance.now()` from the tracker.
- [x] 1.4 `getBboxCenter` → `getBbox` returning `{ cx, cy, diag }` or `null`; drop poses that return `null`.
- [x] 1.5 Replace `CONFIG.TRACKING.MAX_DISTANCE_PX` with `MAX_DISTANCE_RATIO` (relative to the instance's bbox diagonal).
      Implemented relative to the larger diagonal of the instance and the detection (0.5), so a person who has just
      entered (partial, small bbox) can still be matched as more of them becomes visible.
      The diagonal has a floor, `MIN_MATCH_DIAG_PX` (40 video px, roughly a head at dancing distance at 640×480), so a
      pose with one or two confident keypoints (diagonal ~0) can still re-match.
- [x] 1.6 Implement global nearest-first matching.
- [x] 1.7 Implement lowest-free-palette-index colour assignment.
      `lowestFreeIndex(key, count, t)` is generic, so `add-look-editor` 3.1 can reuse it for `slot`. Not the same
      field: colours use all 8 palette entries over every tracked instance (including ones in their grace period),
      while slots are 0–4.
- [x] 1.8 Add `CONFIG.TRACKING.RENDER_GRACE_FRAMES`; expose a `visible` flag (or filtered list) for the renderer.
      Deviation: the tracker is updated per estimate (~20–30 Hz, lower on slow devices), not per rendered frame, so
      both windows are time-based using the estimate timestamp: `GRACE_PERIOD_MS` (1000, replaces
      `GRACE_PERIOD_FRAMES`) and `RENDER_GRACE_MS` (150, long enough to cover one missed estimate down to ~7 Hz).
      `update()` returns the filtered list of instances to draw; `tracker.instances` holds every tracked one, so the
      renderer is unchanged.
- [x] 1.9 Skip filter updates for keypoints below `MIN_CONFIDENCE`.
- [x] 1.10 Add unit tests covering the scenarios in `specs/instance-tracking/spec.md`.
      `tests/tracker.test.js`, `tests/filters.test.js`; run with `make test` (`node --test 'tests/*.test.js'`).
- [x] 1.12 Add `tracker.reset()` and call it when the loops start, so people and filter state from a previous
      camera session don't match new people (review carry-over).
- [ ] 1.11 Verify on device: two people crossing keep their colours; a person leaving disappears within ~0.15 s.
