# Change: Improve instance tracking

## Why
- T1: `createDetector` (`ml.js:12-15`) leaves pose-detection's MoveNet defaults on. I believe `enableSmoothing` and
  `enableTracking` default to true for MultiPose, so keypoints are smoothed twice (more lag) and people are tracked
  twice. **Verify the defaults in the pinned pose-detection version.**
- T2: matching is greedy in old-instance order (`tracker.js:15-30`), so IDs swap when people cross.
- T3: a pose with no confident keypoints gets centre `(0,0)` (`tracker.js:92`) and can match anyone near the top-left.
- T4: colour index = `nextId % 8` after incrementing (`tracker.js:69`): the first person is magenta, and two people
  on screen can share a colour. `CLAUDE.md` Step 5 says one colour per person.
- T5: unmatched people are drawn frozen for up to 30 frames (`tracker.js:44-47`).
- T6: low-confidence keypoint positions are fed into the One Euro filters (`tracker.js:37-41`).
- T7: the tracker reads `performance.now()` itself (`tracker.js:11`); it must use the estimate's timestamp and be testable.
- C3: fixed 100 px matching distance (see `unify-coordinate-mapping`).

## What Changes
- Create the detector with `enableSmoothing: false, enableTracking: false` so our tracker and One Euro filter (required
  by `CLAUDE.md` Step 4) are the only ones.
- `update(poses, timestamp)` takes the time as a parameter.
- Drop poses with no confident keypoint before matching; `getBboxCenter` returns `null` instead of `(0,0)`, and also
  returns bbox size for the relative threshold.
- Global nearest-first matching: compute all (instance, pose) distances under the threshold, sort ascending, assign
  pairs greedily, skipping used ones.
- Colour assignment: a new instance gets the lowest palette index not used by any currently tracked instance;
  the colour is kept while the instance lives. First person = `#00FFFF`.
- Split grace periods: keep unmatched instances for matching for `GRACE_PERIOD_MS` (1000), but only render them for
  `RENDER_GRACE_MS` (150) to hide one-estimate dropouts without showing frozen ghosts. Time-based, because the tracker
  runs per estimate, not per rendered frame.
- `tracker.reset()` on loop start, so a camera restart starts with no tracked people.
- For keypoints with score below `MIN_CONFIDENCE`, keep the last filtered position and don't update that keypoint's
  filter; store the new low score so it's skipped when drawing.
- Add small unit tests for `OneEuroFilter` and `InstanceTracker` (plain ES modules runnable in the browser or Node,
  no framework required).

## Impact
- Affected specs: `instance-tracking`
- Affected code: `js/logic/tracker.js`, `js/services/ml.js`, `js/config.js`, `js/core/engine.js` (reset), `tests/`, `Makefile`
