# Tasks

- [ ] 1.1 Check pose-detection's MoveNet defaults for `enableSmoothing` / `enableTracking` in the pinned version.
- [ ] 1.2 Pass `enableSmoothing: false, enableTracking: false` to `createDetector`.
- [ ] 1.3 Change `InstanceTracker.update(poses)` → `update(poses, timestamp)`; remove `performance.now()` from the tracker.
- [ ] 1.4 `getBboxCenter` → `getBbox` returning `{ cx, cy, diag }` or `null`; drop poses that return `null`.
- [ ] 1.5 Replace `CONFIG.TRACKING.MAX_DISTANCE_PX` with `MAX_DISTANCE_RATIO` (relative to the instance's bbox diagonal).
- [ ] 1.6 Implement global nearest-first matching.
- [ ] 1.7 Implement lowest-free-palette-index colour assignment.
- [ ] 1.8 Add `CONFIG.TRACKING.RENDER_GRACE_FRAMES`; expose a `visible` flag (or filtered list) for the renderer.
- [ ] 1.9 Skip filter updates for keypoints below `MIN_CONFIDENCE`.
- [ ] 1.10 Add unit tests covering the scenarios in `specs/instance-tracking/spec.md`.
- [ ] 1.11 Verify on device: two people crossing keep their colours; a person leaving disappears within ~0.1 s.
