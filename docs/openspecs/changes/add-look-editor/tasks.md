# Tasks

See `design.md` for the model pose, the transform math and the data format.

## 1. Rig (pure logic)
- [x] 1.1 `js/config.js`: add `KP` name→index map, `MODEL_POSE` (design §1), `LOOKS` constants (model size,
      storage key, max persons = `TRACKING.MAX_INSTANCES`). No look line width: items use the render pass's width.
- [x] 1.2 `js/logic/rig.js`: virtual points (`NECK`, `PELVIS`), `BONES` by name, `nearestBone(point)`,
      `boneMatrix(boneName, liveKeypoints)` → canvas matrix or `null` if not usable, and the handedness /
      reflection check.
- [x] 1.3 Verify (Node unit tests in `tests/rig.test.js`): with live keypoints = model pose, every bone matrix is
      identity. With the model pose translated, scaled ×2 and rotated 90°, a mapped point lands where expected. A
      mirrored pose is detected as reflected.

## 2. Looks and presets
- [x] 2.1 `js/ui/looks.js`: `tracePath` for each item type, `drawItem(ctx, item, matrixFor, color, style)`,
      `drawLook(ctx, look, matrixFor, color, style)` (`matrixFor` = bone name → matrix, identity in the editor).
- [x] 2.2 Presets Classic, Glow Sticks, Party, EL Suit as data (with helpers for skeleton and outline strokes).
- [x] 2.3 Anchor caching: `bindItem(item)` sets `_bone` / `_bones` from model coordinates.

## 3. Live rendering
- [ ] 3.1 `js/logic/tracker.js`: assign `slot` (lowest free 0–4) to new instances and keep it while tracked.
- [ ] 3.2 `js/ui/renderer.js`: replace the skeleton and face-circle drawing with `drawLook` per instance, using
      `persons[inst.slot] ?? PRESETS.classic` and the instance color for `color: null`. Keep the glow/composite
      setup and reset.
- [ ] 3.3 Verify: with no saved looks, the live view looks like the current skeleton plus face ring.

## 4. Storage
- [x] 4.1 `js/services/storage.js`: `load()` → `persons[5]`, `save(persons)`, with try/catch and a fallback to all
      `null` on missing or invalid data.

## 5. Editor
- [x] 5.1 `index.html` / `style.css`: **Customize Looks** button and the `#editor` overlay (design §8). It must fit
      a phone screen in portrait (canvas scales down, controls wrap).
- [x] 5.2 `js/ui/editor.js`: model canvas (silhouette + landmark dots), person tabs, tools (select, pen, 7 shapes),
      scale/rotate/color/delete, preset load, clear, use default, save on every change.
- [x] 5.3 `js/ui/dom.js` + `js/core/engine.js`: open and close the editor; the renderer reads the current
      `persons` array.

## 6. Docs
- [ ] 6.1 `CLAUDE.md`: add the look system to Phase 1 scope (Core Features + a new step after Step 6). Narrow
      Phase 3 to premium image assets, and note that they plug in as an `image` item type.
- [ ] 6.2 `docs/openspecs/changes/add-renderer-landmark-hooks/proposal.md`: note that decorators are superseded by
      looks.

## 7. Verification (manual, in Chrome desktop, then phone)
- [ ] 7.1 Place glasses on Person 1 in the editor. Live, the glasses sit on the eyes, follow head tilt, and scale
      when you step back.
- [ ] 7.2 Draw a freehand line along the left arm, through the elbow. Live, it bends with the elbow.
- [ ] 7.3 Two people on camera: Person 1 has a custom look, Person 2 has the default skeleton in a different color.
- [ ] 7.4 Reload the page: looks persist. In a private window with storage blocked, the app still runs with
      defaults.
- [ ] 7.5 Each preset loads and renders. EL Suit outlines stay outside the limbs when the person turns their back
      (reflection check).
- [ ] 7.6 Recording captures the custom looks. FPS with 5 people on EL Suit is noted (it has the most draw calls).
