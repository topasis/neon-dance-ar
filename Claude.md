# Neon Dance AR

## Overview

A real-time AR application that detects up to 5 people simultaneously via webcam or phone camera
and renders a neon skeleton overlay on each detected person. The app targets the viral "stickman
dance" trend. No body masking or segmentation is required — the neon skeleton is drawn directly
over the live feed or on a pure black background (user's choice).

Development is split into three phases:
- **Phase 1 — Computer Prototype:** Python + OpenCV, live webcam input, desktop window output. Developed under `/desktop` directory. `uv` tool will be used for this phase.
- **Phase 2 — Native Mobile:** Android (Kotlin) and iOS (Swift), using the same model family. Developed under `/android` and `/ios` directory. 
- **Phase 3 — Shape Customization (In-App Purchase):** Per-landmark visual asset overlay. Future direction only — do not implement during Phase 1 or Phase 2.

---

## Core Features

1. **Multi-Person Pose Estimation:** Tracks up to 5 people simultaneously with low-latency keypoint detection.
2. **Neon Visualization:** Each detected person gets a unique neon color assigned automatically. Skeleton is rendered with additive blending and a bloom glow effect. (Manual color selection and unique textures are deferred to Phase 2/3).
3. **Background Toggle:** A button switches between showing the live camera feed and a pure black background (skeleton-only mode).
4. **Recording:** A start/stop button saves the composited output (including the current background mode) as an MP4 file.
5. **Live Preview:** The composited frame is displayed in real time at 30 FPS minimum.

---

## Platform Requirements

| Property              | Phase 1 (Prototype)         | Phase 2 — Android              | Phase 2 — iOS          |
|-----------------------|-----------------------------|--------------------------------|------------------------|
| Environment           | Desktop (Win / macOS / Linux) | Android 8.0+ (API 26)        | iOS 15+                |
| Language              | Python 3.10+                | Kotlin                         | Swift                  |
| Camera input          | OpenCV webcam               | CameraX                        | AVCaptureSession       |
| GPU delegate          | None required               | TFLite GPU (GpuDelegateV2)     | Core ML                |
| Target FPS            | 30                          | 30–60                          | 30–60                  |

---

## Technical Architecture

### Model

**Primary model: MoveNet MultiPose Lightning (TFLite)**
- Detects up to 6 people simultaneously (we use up to 5).
- 17 keypoints per person (COCO topology).
- TFLite-native — the same model file runs in Python (Phase 1) and on Android/iOS (Phase 2) with no retraining.
- Fall back to **MoveNet MultiPose Thunder** when higher accuracy is needed and compute allows. Make the model switching process easy for development and testing. It should not require modifying the code. It can be set from a config file.

**Why not BlazePose?** BlazePose (MediaPipe Pose) is single-person only. MoveNet MultiPose is the appropriate choice for up to 5 simultaneous detections.

### Rendering

- **Python prototype:** OpenCV drawing primitives (`cv2.line`, `cv2.circle`) with manual alpha compositing for the glow effect. Main development platform is macOS but make sure the code is cross-platform.
- **Native mobile (Phase 2):** Metal (iOS) / OpenGL ES 3.0 or Vulkan (Android) with additive blending shader and Gaussian bloom pass.

### Threading — Phase 1 (Python)

Two threads:
- **Main (Capture & Render) thread:** Reads frames from OpenCV webcam. Uses the most recent pose estimations available to draw the skeleton, displays the result, and pipes to the recorder if active. Never blocks waiting for inference.
- **Inference thread:** Asynchronously runs MoveNet on the latest captured frame and updates a thread-safe variable with the parsed and filtered keypoints.

### Threading — Phase 2 (Native Mobile)

Three threads:
- **Camera thread:** Captures frames, converts YUV → RGB.
- **Inference thread:** Runs MoveNet asynchronously via GPU delegate, pushes latest keypoints to a thread-safe result buffer (atomic pointer swap).
- **Render thread:** Reads the latest keypoints and renders the composited frame at target FPS. Never blocks waiting on the inference thread — uses last known valid keypoints if new results are not yet available.

---

## Out of Scope

- Web or desktop GUI frameworks (Electron, Flutter desktop, etc.)
- Body masking or human silhouette segmentation
- Face or hand landmark tracking beyond the 17 COCO keypoints
- Real-time streaming to external platforms
- In-app video editing
- More than 5 simultaneous people
- Any in-app purchase functionality should be implemented in phase 3

---

## Agent Implementation Instructions

**IMPORTANT:** Follow the policy below when implementing the code in each phase.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**
Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## Agent Phase Instructions

---

### Phase 1 — Python Prototype

Use this instructions for building the python prototype. I will test the code on my macOS. It should use the default webcam of my mac. If the webcam is not found or cannot be opened, it should show a helpful error message and exit. *Note for macOS:* Make sure the error message specifically mentions checking "macOS System Settings -> Privacy & Security -> Camera" to ensure the terminal/IDE has camera permissions, as missing permissions will cause `cv2.VideoCapture(0)` to fail silently or hang. The code should always be well-structured and modular. Use OOP. 

---

#### Step 1 — Environment Setup

Use `uv` to create a virtual environment and install dependencies:
```bash
uv init
uv add opencv-python tflite-runtime numpy
```

*Note on cross-platform compatibility:* `tflite-runtime` might lack pre-built wheels on PyPI for certain architectures like macOS Apple Silicon (M1/M2/M3). If `uv add tflite-runtime` fails, fallback to installing the full TensorFlow package (`uv add tensorflow` or `uv add tensorflow-macos`) and update the import in the code from `tflite_runtime.interpreter` to `tensorflow.lite.Interpreter`.

Add a makefile with commands for `install`, `run`, `lint`, and `format`.

Download the model:
```
MoveNet MultiPose Lightning:
Download from Kaggle Models (formerly TF Hub):
https://www.kaggle.com/models/google/movenet/tfLite/multipose-lightning
(Alternatively, if using curl/wget, ensure you follow HTTP redirects to get the actual .tflite binary).
```
Save the model inside the `assets/models/` directory as `movenet_multipose_lightning.tflite` from the root directory of the project.

#### Step 2 — Run MoveNet MultiPose Inference

**Input:**
- Resize the input frame to **256 × 256** before passing to the model (required input shape for MultiPose Lightning).
- Cast pixel values to `int32`.

**Output tensor shape:** `[1, 6, 56]`
- Axis 1: up to 6 detected instances (use the first 5; ignore instance 6).
- Axis 2: 56 values per instance:
  - Indices `[0:51]`: 17 keypoints × 3 values each → `[y, x, confidence]` (normalized 0.0–1.0).
  - Indices `[51:56]`: bounding box → `[y_min, x_min, y_max, x_max, instance_score]`.

**Instance filtering:**
- Only process instances where `instance_score > 0.2`.
- Only render a keypoint if its individual `confidence > 0.3`.
- Sort detected instances by `instance_score` descending; take the top 5.

---

#### Step 3 — Temporal Smoothing

Apply a **One Euro Filter** independently to each keypoint's `x` and `y` coordinates for each tracked instance.

Starting parameters:
- `min_cutoff = 1.0`
- `beta = 0.1`
- `d_cutoff = 1.0`

These must be defined as named constants at the top of the script — not hardcoded inline — so they can be tuned during testing.

**Instance identity across frames:** Assign each detected instance an ID based on proximity of
their bounding box center to the previous frame's instances (nearest-neighbor matching). If no
match is found within a threshold (e.g. 80px at native resolution), treat it as a new instance
and reset its filter state.

---

#### Step 4 — Neon Color Assignment

Assign one neon color per tracked instance ID. Colors persist across frames as long as the
instance is matched.

Suggested palette (BGR for OpenCV):
```python
NEON_COLORS = [
    (0, 255, 255),    # Cyan
    (255, 0, 255),    # Magenta
    (0, 255, 0),      # Green
    (255, 165, 0),    # Orange
    (255, 255, 0),    # Yellow
    (255, 0, 0),      # Red
    (0, 0, 255),      # Blue
    (255, 255, 255),  # White
]
```
Instance with ID 0 gets color 0, ID 1 gets color 1, etc. (modulo 5).

---

#### Step 5 — Skeleton Rendering

**Keypoint connections (COCO 17-keypoint topology):**
```python
CONNECTIONS = [
    (0, 1), (0, 2),           # Nose to eyes
    (1, 3), (2, 4),           # Eyes to ears
    (5, 6),                   # Shoulders
    (5, 7), (7, 9),           # Left arm
    (6, 8), (8, 10),          # Right arm
    (5, 11), (6, 12),         # Torso
    (11, 12),                 # Hips
    (11, 13), (13, 15),       # Left leg
    (12, 14), (14, 16),       # Right leg
]
```

**Rendering steps per frame:**

1. If background mode is **black**: create a zero-filled image (`np.zeros_like(frame)`). If background mode is **camera**: use the raw camera frame.
2. For each active instance, for each connection `(a, b)`:
   - Skip if either endpoint has `confidence < 0.3`.
   - Draw a line between the two keypoints using the instance's neon color (`cv2.line`, thickness=3).
3. For each active instance, for each visible keypoint:
   - Draw a filled circle (`cv2.circle`, radius=5, filled).
4. Apply glow effect (see Step 6).
5. Display the result with `cv2.imshow`.

---

#### Step 6 — Glow Effect (Bloom Approximation)

After drawing the skeleton on the canvas, apply the following:

```python
def apply_glow(canvas, blur_strength=21, blend_weight=0.6):
    blurred = cv2.GaussianBlur(canvas, (blur_strength, blur_strength), 0)
    glowed = cv2.addWeighted(canvas, 1.0, blurred, blend_weight, 0)
    return np.clip(glowed, 0, 255).astype(np.uint8)
```

- `blur_strength` must be an odd integer. Start at 21.
- `blend_weight` controls glow intensity. Start at 0.6.
- Both must be exposed as named constants for tuning.
- On low-end machines: reduce `blur_strength` to 11 if frame rate drops below 20 FPS.

---

#### Step 7 — Background Toggle

Maintain a boolean flag `show_camera_feed` (default: `True`).

- If `True`: use the raw camera frame as the background before drawing skeletons.
- If `False`: use `np.zeros_like(frame)` as the background.

Toggle this flag when the user presses the **`B` key** (for "Background").

Display the current mode as a small text label in the top-left corner of the preview window:
```python
cv2.putText(output, "BG: Camera" if show_camera_feed else "BG: Black", ...)
```

---

#### Step 8 — Recording

Use OpenCV's `cv2.VideoWriter` to save output frames.

```python
fourcc = cv2.VideoWriter_fourcc(*'mp4v')
out = cv2.VideoWriter('output.mp4', fourcc, 30.0, (frame_width, frame_height))
```

- Recording writes the fully composited output frame (after glow, with the current background mode applied).
- Toggle recording when the user presses the **`R` key**.
- Display recording state in the top-left corner:
  - Recording: red dot indicator + "REC" label.
  - Not recording: no indicator.
- When recording stops, call `out.release()` and print the output filename to console.
- Output filename format: `recording_YYYYMMDD_HHMMSS.mp4`.

---

#### Step 9 — Main Loop Structure

```
Initialize webcam (cv2.VideoCapture(0))
Initialize TFLite interpreter with MoveNet MultiPose model
Initialize VideoWriter as None
Initialize shared thread-safe variable for latest parsed instances/keypoints

Start Inference Thread:
    Loop:
        Grab latest frame
        Preprocess frame for model (resize to 256×256, cast to int32)
        Run inference
        Parse output tensor (instances, keypoints, scores)
        Filter instances by instance_score threshold (> 0.2)
        Sort by instance_score descending, take top 5
        Update shared thread-safe variable with filtered instances

Start Main Loop (Capture & Render Thread):
    Loop:
        Read frame from webcam
        If frame read fails: break
        
        Copy latest available instances from shared variable

        Build output canvas (camera frame or black based on toggle flag)
        
        If instances are available:
            Match instances to previous frame IDs (nearest-neighbor on bbox center)
            Apply One Euro Filter to matched keypoint positions
            
            For each active instance:
                Draw skeleton connections (skip if either endpoint confidence < 0.3)
                Draw joint circles at visible keypoints
            Apply glow effect (Gaussian blur + addWeighted)

        Overlay UI labels (BG mode, REC indicator)
        Display with cv2.imshow

        If recording active: write composited frame to VideoWriter

        Handle key presses:
            B → toggle show_camera_feed flag
            R → toggle recording (initialize or release VideoWriter)
            Q or ESC → exit loop

Release webcam
If VideoWriter is open: release it
Stop Inference Thread
Destroy all OpenCV windows
```

---

#### Step 10 — Performance Targets and Fallbacks

| Metric             | Target         | Fallback action                                            |
|--------------------|----------------|------------------------------------------------------------|
| Frame rate         | ≥ 30 FPS       | Reduce glow `blur_strength` from 21 → 11                  |
| Inference time     | ≤ 25 ms/frame  | Already using Lightning (fastest variant); no further action |
| Keypoint jitter    | Visually smooth | Decrease One Euro Filter `beta`                           |

Print average FPS to console every 5 seconds.

---

### Phase 2 — Native Mobile (Android & iOS)

> To be detailed after Phase 1 is validated. The architecture follows the same pipeline:
> MoveNet MultiPose TFLite → One Euro Filter → Neon skeleton renderer → Background toggle → Recording.

Key differences from Phase 1:

- Enable GPU delegate (TFLite GPU on Android, Core ML on iOS).
- Use three-thread model (Camera / Inference / Render) instead of two.
- Replace OpenCV drawing with native shader-based rendering using additive blending and a proper Gaussian bloom FBO pass.
- Recording includes audio via `AudioRecord` + `MediaCodec` (Android) or `AVCaptureAudioDataOutput` + `AVAssetWriter` (iOS).
- Output: 1080 × 1920 (9:16 portrait), H.264, AAC audio, MP4 container.
- Sharing via TikTok Open Platform SDK and native share sheets (`Intent.ACTION_SEND` on Android, `UIActivityViewController` on iOS).
- UI controls become native on-screen buttons instead of keyboard shortcuts.
- Thermal management: monitor device thermal state and drop to Lite model / 30 FPS cap on serious thermal warnings.
- App lifecycle: pause all threads on backgrounding; release GPU resources if backgrounded for > 5 seconds; restore on foreground.

**Per-landmark override hook (required for Phase 3 compatibility):**
The Phase 2 rendering pipeline must route each landmark's draw call through a single function
that checks whether a shape asset is assigned to that landmark, and dispatches to either the
default dot renderer or the asset renderer. This hook must be in place before Phase 3 begins,
even if no assets are registered yet. See Phase 3 for the full contract.

---

### Phase 3 — Shape Customization (In-App Purchase)

> **Do not implement during Phase 1 or Phase 2.** This section defines the design contract so
> that the Phase 2 rendering architecture accommodates it without rework.

---

#### Overview

Phase 3 introduces a per-landmark shape layer. Instead of (or on top of) the neon stick skeleton,
users can assign a visual asset — an SVG vector shape or PNG image — to any individual landmark.
Each asset is positioned, scaled, and optionally rotated relative to its assigned landmark in
real time.

This feature is available as an in-app purchase and operates in **single-person mode only**:
when Shape Mode is active, the app selects the one detected person with the highest
`instance_score` and ignores all others.

---

#### Asset Types

Each shape asset is either:

- **SVG vector** — preferred for neon-style shapes (circle, triangle, line, rectangle, square, heart, glasses, etc.). Rendered at any scale without quality loss. Tinted with the user's chosen neon color at runtime.
- **PNG image** — for photographic or complex assets that cannot be expressed as vectors. Must be provided with a transparent background.

All assets are stored in a dedicated asset registry (see Asset Registry below). The rendering
pipeline treats both types uniformly through a common `ShapeAsset` interface.

---

#### Landmark-to-Shape Mapping

The user assigns one asset to one or more of the 17 COCO landmarks. The mapping is stored as
a user configuration:

```
landmark_id  →  { asset_id, scale, tilt_enabled }
```

| Field          | Description                                                                                  |
|----------------|----------------------------------------------------------------------------------------------|
| `landmark_id`  | Integer 0–16 (COCO keypoint index)                                                           |
| `asset_id`     | String identifier referencing an entry in the asset registry                                 |
| `scale`        | Float multiplier relative to a base size (1.0 = default). User-adjustable via slider.        |
| `tilt_enabled` | Boolean. If true, the asset rotates to match the angle derived from the landmark's reference pair (see Tilt below). |

A landmark with no mapping assigned falls back to the standard neon dot and connected bone
lines, as in Phase 2.

---

#### Placement

Each assigned asset is rendered centered on its landmark's screen-space position `(x, y)`,
derived from the MoveNet output normalized coordinates scaled to the display resolution:

```
screen_x = landmark.x * frame_width
screen_y = landmark.y * frame_height
```

The asset is drawn centered on `(screen_x, screen_y)` at the user-defined scale. Base size for
scale `1.0` is defined per asset in the asset registry (e.g. 60px for a face circle, 80px for
glasses).

---

#### Tilt (Rotation)

When `tilt_enabled` is true for a landmark, the asset's rotation angle is derived from a
**reference landmark pair** — two landmarks whose relative position defines a natural orientation
axis for that body region. The angle is `atan2(dy, dx)` between the two reference points.

Reference pairs per landmark:

| Landmark(s)                        | Reference pair for tilt              |
|------------------------------------|--------------------------------------|
| Nose (0), left eye (1), right eye (2) | left_eye (1) → right_eye (2)      |
| Left ear (3)                       | left_eye (1) → left_ear (3)         |
| Right ear (4)                      | right_eye (2) → right_ear (4)       |
| Left shoulder (5)                  | left_shoulder (5) → right_shoulder (6) |
| Right shoulder (6)                 | left_shoulder (5) → right_shoulder (6) |
| Left elbow (7)                     | left_shoulder (5) → left_elbow (7)  |
| Left wrist (9)                     | left_elbow (7) → left_wrist (9)     |
| Right elbow (8)                    | right_shoulder (6) → right_elbow (8) |
| Right wrist (10)                   | right_elbow (8) → right_wrist (10)  |
| Left hip (11), right hip (12)      | left_hip (11) → right_hip (12)      |
| Left knee (13)                     | left_hip (11) → left_knee (13)      |
| Left ankle (15)                    | left_knee (13) → left_ankle (15)    |
| Right knee (14)                    | right_hip (12) → right_knee (14)    |
| Right ankle (16)                   | right_knee (14) → right_ankle (16)  |

If either landmark in the reference pair has `confidence < 0.3`, tilt falls back to 0°
(upright) for that frame.

Apply the same One Euro Filter used for position smoothing to the rotation angle to prevent
angular jitter.

> **Simplification option:** If tilt causes visual instability during testing (e.g. rapid angle
> flipping when a limb is nearly horizontal), `tilt_enabled` can be disabled per-landmark
> without affecting the rest of the system. This is a per-asset toggle, not a global flag.

---

#### Asset Registry

A static registry maps `asset_id` strings to asset metadata. This is the primary extension
point — adding new shapes requires only a new registry entry and a new asset file, with no
changes to the rendering pipeline.

```python
ASSET_REGISTRY = {
    "circle": {
        "type": "svg",
        "file": "assets/shapes/circle.svg",
        "base_size_px": 60,
        "tint_supported": True,
    },
    "triangle": {
        "type": "svg",
        "file": "assets/shapes/triangle.svg",
        "base_size_px": 60,
        "tint_supported": True,
    },
    "rectangle": {
        "type": "svg",
        "file": "assets/shapes/rectangle.svg",
        "base_size_px": 60,
        "tint_supported": True,
    },
    "square": {
        "type": "svg",
        "file": "assets/shapes/square.svg",
        "base_size_px": 60,
        "tint_supported": True,
    },
    "line": {
        "type": "svg",
        "file": "assets/shapes/line.svg",
        "base_size_px": 60,
        "tint_supported": True,
    },
    "heart": {
        "type": "svg",
        "file": "assets/shapes/heart.svg",
        "base_size_px": 50,
        "tint_supported": True,
    },
    "glasses": {
        "type": "svg",
        "file": "assets/shapes/glasses.svg",
        "base_size_px": 80,
        "tint_supported": True,
    },
    "glass_neon": {
        "type": "svg",
        "file": "assets/shapes/glass_neon.svg",
        "base_size_px": 80,
        "tint_supported": True,
    },
    # PNG example:
    "crown": {
        "type": "png",
        "file": "assets/shapes/crown.png",
        "base_size_px": 70,
        "tint_supported": False,
    },
}
```

---

#### Rendering Integration Requirements for Phase 2

The Phase 2 rendering pipeline must be structured to accommodate Phase 3 without architectural
changes. Specifically:

- The per-landmark draw call must be **modular**: drawing a landmark must go through a single
  function or method that checks whether a shape asset is assigned, and dispatches to either
  the default dot renderer or the asset renderer.
- The skeleton renderer must expose a **per-landmark override hook** — a dictionary or map from
  `landmark_id` to an optional asset — so Phase 3 can inject assets without modifying the core
  rendering loop.
- Asset rendering (centered placement, scale, rotation) must be **isolated from inference
  logic** — it operates purely on screen-space `(x, y)` and angle, which are already available
  after the One Euro Filter step.
- Both SVG and PNG assets must go through the same placement and rotation transform so future
  asset types require no renderer changes.

---

#### Out of Scope for Phase 3

- Multi-person shape assignment (Shape Mode is single-person only)
- Physics or animation on shapes (shapes are rigidly attached to landmarks)
- User-uploaded custom assets (predefined asset registry only)
- Shape-to-bone-connection replacement (shapes are landmark-anchored, not connection-spanning)

---

## Key Dependencies

| Component         | Phase 1 (Python)                      | Phase 2 Android                            | Phase 2 iOS                        |
|-------------------|---------------------------------------|--------------------------------------------|------------------------------------|
| Pose model        | `tflite-runtime`                      | `org.tensorflow:tensorflow-lite`           | TFLite iOS / Core ML               |
| Camera input      | `cv2.VideoCapture`                    | CameraX                                    | AVCaptureSession                   |
| Rendering         | OpenCV draw + `cv2.addWeighted`       | OpenGL ES 3.0 / Vulkan                     | Metal                              |
| Recording         | `cv2.VideoWriter`                     | MediaCodec + AudioRecord                   | AVAssetWriter + AVCaptureAudioDataOutput |
| Smoothing         | One Euro Filter (pure Python)         | One Euro Filter (Kotlin port)              | One Euro Filter (Swift port)       |
| Sharing           | N/A                                   | TikTok Open Platform SDK, Intent API       | TikTok Open Platform SDK, UIActivityViewController |
