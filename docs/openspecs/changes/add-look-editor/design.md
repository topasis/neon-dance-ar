# Design: customizable looks

## 1. Model pose (reference body)

A fixed, front-facing body in a 300 × 600 *model space*, seen as the camera sees it (unmirrored). The person's
**left** side is on the image **right**, which matches the live keypoints. Arms are slightly out (A-pose) so
arm bones and torso bones are far enough apart for nearest-bone anchoring.

| # | Keypoint | x | y |   | # | Keypoint | x | y |
|---|---|---|---|---|---|---|---|---|
| 0 | NOSE | 150 | 70 | | 9 | L_WRIST | 275 | 300 |
| 1 | L_EYE | 162 | 58 | | 10 | R_WRIST | 25 | 300 |
| 2 | R_EYE | 138 | 58 | | 11 | L_HIP | 178 | 310 |
| 3 | L_EAR | 178 | 64 | | 12 | R_HIP | 122 | 310 |
| 4 | R_EAR | 122 | 64 | | 13 | L_KNEE | 182 | 430 |
| 5 | L_SHOULDER | 195 | 140 | | 14 | R_KNEE | 118 | 430 |
| 6 | R_SHOULDER | 105 | 140 | | 15 | L_ANKLE | 185 | 550 |
| 7 | L_ELBOW | 245 | 220 | | 16 | R_ANKLE | 115 | 550 |
| 8 | R_ELBOW | 55 | 220 | | | | | |

Virtual points, computed the same way for the model and live: `NECK` (17) = midpoint of the shoulders,
`PELVIS` (18) = midpoint of the hips. A virtual point is confident only when both of its source points are.

These numbers are starting values. Tune them so the figure looks right in the editor. (Tuned in part A: the arms were
widened from elbows 220/80, wrists 235/65 so EL Suit wires on the inner upper arm and outer torso anchor to their own
bone. The `looks` unit tests check that every generated wire stays on one bone after any further tuning.)

## 2. Bones (anchor frames)

```
EYES      [L_EYE, R_EYE]        SHOULDERS [L_SHOULDER, R_SHOULDER]   SPINE  [NECK, PELVIS]
L_UPPER   [L_SHOULDER, L_ELBOW]  L_FORE    [L_ELBOW, L_WRIST]
R_UPPER   [R_SHOULDER, R_ELBOW]  R_FORE    [R_ELBOW, R_WRIST]
L_SIDE    [L_SHOULDER, L_HIP]    R_SIDE    [R_SHOULDER, R_HIP]       HIPS   [L_HIP, R_HIP]
L_THIGH   [L_HIP, L_KNEE]        L_SHIN    [L_KNEE, L_ANKLE]
R_THIGH   [R_HIP, R_KNEE]        R_SHIN    [R_KNEE, R_ANKLE]
```

Items store bones by **name** (not array index) so the list can grow without breaking saved looks.

Face bones `NOSE_L [NOSE, L_EYE]`, `NOSE_R [NOSE, R_EYE]`, `EAR_L [L_EYE, L_EAR]`, `EAR_R [R_EYE, R_EAR]` exist only for
points that sit on a keypoint (below); `nearestBone` never picks them, because they are short and jittery.

**Anchoring rule:** a point anchors to the bone with the smallest point-to-segment distance (the projection is
clamped to the segment) in model space. Head items (glasses, hat) land on `EYES`. A chest circle lands on `SPINE`.
A point within `LOOKS.JOINT_SNAP` of a keypoint instead gets an ordered list of candidates: every bone ending at that
keypoint, since each maps it exactly. Drawing uses the first usable candidate, so a joint stays drawn while any of
its bones is visible. For stroke points, the candidates shared with a neighbouring point come first (a
shoulder→elbow line uses `L_UPPER` at both ends, the hip line uses `HIPS`). Classic relies on this: every connection
whose two keypoints are confident is drawn, like the old renderer. The head ring sits on the nose and anchors to
`NOSE_L`/`NOSE_R`. Other points have a single candidate.

## 3. Model → live transform

For a bone with model endpoints `A0, B0` and live endpoints `A, B`, take the similarity transform that maps
`A0→A` and `B0→B`. With complex numbers: `p' = A + k·(p − A0)`, where `k = (B − A) / (B0 − A0)`.

```
d0 = B0 − A0, d = B − A, n = d0.x² + d0.y²
kr = (d.x·d0.x + d.y·d0.y) / n
ki = (d.y·d0.x − d.x·d0.y) / n
canvas matrix (a, b, c, d, e, f) = (kr, ki, −ki, kr,
                                    A.x − kr·A0.x + ki·A0.y,
                                    A.y − ki·A0.x − kr·A0.y)
```

A bone is usable only when both live endpoints have score > `CONFIG.TRACKING.MIN_CONFIDENCE`. An item whose bone
isn't usable is skipped for that frame.

**Reflection check:** if the live body is mirrored relative to the model (the person faces away, or the preview
gets mirrored by change 5), a pure similarity transform puts offsets on the wrong side of the bone. For example,
an arm outline ends up inside the arm. Compute the body's handedness as the sign of
`cross(L_SHOULDER − R_SHOULDER, PELVIS − NECK)` for both the model and the live pose. If the signs differ, mirror
each item across its bone axis in model space before applying `k` (equivalent: use `conj` on the offset relative
to the bone line). If the torso isn't visible, use the head instead: the sign of `cross(L_EYE − R_EYE, NOSE − R_EYE)`
(otherwise close-up selfies on the mirrored front camera would get head items upside down). The cross product is normalised by
`|below − R|²`, which measures how frontal the body is (≈ 0.5 for the model torso, 1 for the model head). Below
`LOOKS.MIN_FACING` (side-on), or when nothing is visible, the person keeps their previous reflection (hysteresis; 55
flips per 100 frames otherwise). Before the first confident decision the renderer's prior applies: a mirrored canvas
(front camera) means a front-facing person is reflected.

**Short bones:** a bone whose scale (live length / model length) is below `LOOKS.MIN_BONE_SCALE_RATIO` × the person's
largest body-bone scale is unusable for that frame. This covers side-on eyes and limbs pointing at the camera, where
the bone's angle is mostly noise and a hat would spin.

The mirrored case is still one affine matrix per bone: with `w = d / conj(d0)`, `p' = A + w·conj(p − A0)`, i.e.
`(a, b, c, d) = (wr, wi, wi, −wr)`, where `wr = (d.x·d0.x − d.y·d0.y) / n` and `wi = (d.x·d0.y + d.y·d0.x) / n`.
`js/logic/rig.js` computes all bone matrices once per person per frame (`Rig#update`) and items read them by name.

## 4. Data model

```js
// Item, all coordinates in model space
{ id, type: 'circle'|'rect'|'triangle'|'line'|'glasses'|'hat'|'smile'|'stroke',
  x, y,              // centre (unused for stroke)
  scale: 1,          // relative to the shape's base size (≈ 40 model units)
  rotation: 0,       // radians, in model space
  color: null,       // '#RRGGBB' or null = person's neon color
  points: [{x, y}]   // stroke only
}

// Look
{ name, items: [Item] }

// Saved state (localStorage key 'neonDance.looks.v1')
{ version: 1, persons: [Look | null, ×5] }   // null = default look
```

Anchors aren't stored. They're computed from model coordinates when an item is loaded or edited, then cached on
the in-memory item (`item._bone`, and `item._bones[]` for each stroke point). Saved looks then stay valid if the
model pose or bone list is tuned later.

Storage wrapper (`js/services/storage.js`): every `localStorage` access goes through try/catch. When storage is
missing or holds invalid JSON, every person falls back to the default look.

## 5. Drawing items

`js/ui/looks.js` exports a `tracePath(ctx, item)` per type. It adds subpaths centred at (0, 0) at base size, with
no `beginPath` and no stroke. The caller applies placement and strokes once:

```js
ctx.save();
ctx.transform(...boneMatrix);          // model → live (identity in the editor)
ctx.translate(item.x, item.y);
ctx.rotate(item.rotation);
ctx.scale(item.scale, item.scale);
ctx.beginPath(); tracePath(ctx, item);
ctx.restore();                         // the path keeps its transformed coordinates
ctx.lineWidth = style.lineWidth;        // the render pass's width, in that pass's pixels
ctx.stroke();
```

`drawLook(ctx, look, matrixFor, color, style)` / `drawItem(...)` take the render pass's `style` (`renderer.glowStyle`
or `renderer.crispStyle`, `{ lineWidth, glow }`), because the glow pipeline (ADR 0002) draws everything twice: thick
lines (`RENDER.GLOW_LINE_WIDTH`) on the downscaled glow layer and thin ones (`RENDER.LINE_WIDTH`) on the main canvas.
A fixed look line width would remove the halo. The width isn't scaled per item or by bone length, the same as the
old skeleton. Consecutive items of the same colour share one `stroke()` call.

Base shapes: circle = ring r 20; rect = 40 × 26; triangle = equilateral, side 44; line = 50 long, horizontal;
glasses = two rings r 10 at x ±13 plus a bridge; hat = fedora (brim line + crown trapezoid); smile = lower arc
r 18. Everything is stroked, never filled, so it looks like neon tubes.

Strokes: map every point through **its own** bone's transform and draw one polyline. Start a new subpath whenever
a point's bone isn't usable.

Glow and blending are unchanged: the renderer's two passes (`renderGlowPass` / `renderCrispPass`, `'lighter'`
composite inside `save`/`restore`) call `drawLook` once each per person.

## 6. Per-person slots and the default look

- The tracker assigns each new instance `slot` = the lowest index 0–4 that no current instance uses. The slot is
  kept while the instance is tracked. Person N = slot N−1, which is the order people entered the frame.
  - **Assumption, not yet confirmed by the user.** The alternative is to sort by screen position (left to right)
    every frame. That is easier to understand while dancing, but slots swap when people cross.
- Render: `look = persons[inst.slot] ?? PRESETS.classic`. Items with `color: null` use
  `CONFIG.NEON_COLORS[inst.colorIndex]`, so people without a custom look get the default shapes in their own
  auto-assigned color. Finding T4 (two people can share a color) affects this, so it's worth fixing at the same time.
- Classic preset = a `stroke` of two points along each body connection, plus a head `circle` (bound to `EYES`,
  about 1.75 × eye distance, the current face ring), plus small rings at the joints (current joint dots). It must
  look about the same as the current renderer.

## 7. Presets (data, in `js/ui/looks.js`)

| Preset | Content | Colors |
|---|---|---|
| Classic | Skeleton strokes, head ring, joint rings | person color |
| Glow Sticks | One stroke per bone, trimmed ~8 % at each end (gaps at joints); head ring | fixed glow-stick palette, a different color per bone |
| Party | Glasses, smile, collar arc, chest circle, suspender lines, double belt line, knee circles, short limb sticks | fixed per part |
| EL Suit | Hat, plus outline strokes on both sides of each limb and the torso (offset ~12 model units from the bones) | person color |

Generate the repetitive strokes (skeleton, outlines) with small helper functions, not literal coordinates.

## 8. Editor (`js/ui/editor.js`)

Full-screen overlay (`#editor`), opened with a **Customize Looks** button in the main controls. The live loop keeps
running underneath.

```
┌ Person: [1] [2] [3] [4] [5]                      [Done] ┐
│ Tools: Select · Pen · Circle · Rect · Triangle · Line   │
│        Glasses · Hat · Smile                            │
│ ┌───────────── model canvas 300×600 ──────────────┐     │
│ │ grey body silhouette + landmark dots             │     │
│ │ items in neon; selected item has a dashed box    │     │
│ └──────────────────────────────────────────────────┘     │
│ Color [■] [x] Person color   Scale ──●──   Rotate ──●──  │
│ [Delete]  Preset: [Classic ▾] [Load]  [Clear]  [Use default] │
└──────────────────────────────────────────────────────────┘
```

- Canvas pixels = model units. Pointer coordinates are converted with `getBoundingClientRect()`, because CSS may
  scale the canvas down on phones. Use Pointer Events so mouse and touch both work.
- **Shape tool:** the next tap places the item at that point with scale 1, selects it and switches back to Select.
- **Pen:** pointer down → move → up records a stroke. Add a point only when it's ≥ 4 units from the last one.
  Discard strokes with fewer than 2 points.
- **Select:** a tap hits the topmost item (within ~25 × scale of a shape's centre, or ~8 units of any stroke
  point). Dragging moves it (all points for a stroke). Tapping empty space deselects. The Delete/Backspace key
  removes the selected item.
- **Scale/Rotate** sliders change the selected shape and are disabled for strokes. **Color:** picker plus a
  "Person color" checkbox (checked = `color: null`). New items take the current color settings.
- **Person tabs:** a slot with no custom look shows the default look with the label "Default look". The first edit
  copies the default into a custom look. **Use default** sets the slot back to `null`. **Load** replaces the slot's
  look with a copy of the chosen preset. **Clear** empties it (a custom look with no items).
- In the editor preview, `color: null` items use `CONFIG.NEON_COLORS[slot]`.
- Save to storage after every change. Re-compute an item's anchors after every move or edit.

## 9. Out of scope
- Image (SVG/PNG) assets: Phase 3 premium. The item format leaves room for a future `image` type.
- Undo/redo, multiple saved looks per slot, sharing or exporting looks, editing items directly on the live video.
