# Neon Dance AR

## Overview

A real-time AR web application that detects up to 5 people simultaneously via webcam or phone camera
and renders a neon skeleton overlay on each detected person. The app targets the viral "stickman
dance" trend. No body masking or segmentation is required — the neon skeleton is drawn directly
over the live feed or on a pure black background (user's choice).

Development is split into three phases:
- **Phase 1 — Web Prototype:** HTML/JS/CSS application. Live webcam input, browser canvas output. 
- **Phase 2 — PWA & Mobile Web Optimization:** Responsive design, mobile camera handling (front/back), and Progressive Web App (PWA) setup.
- **Phase 3 — Shape Customization (Premium):** Per-landmark visual asset overlay. Future direction only — do not implement during Phase 1 or Phase 2.

---

## Core Features

1. **Multi-Person Pose Estimation:** Tracks up to 5 people simultaneously with low-latency keypoint detection using TensorFlow.js.
2. **Neon Visualization:** Each detected person gets a unique neon color assigned automatically. Skeleton is rendered with additive blending and a bloom glow effect. (Manual color selection and unique textures are deferred to Phase 2/3).
3. **Background Toggle:** A button switches between showing the live camera feed and a pure black background (skeleton-only mode).
4. **Music Playback:** The app plays a selected music track while the user dances. This music is mixed into the recorded video.
5. **Recording:** A start/stop button saves the composited output (including the current background mode and the music audio track) as a video file (WebM/MP4) for easy user sharing.
6. **Live Preview:** The composited frame is displayed in real time on an HTML5 `<canvas>` at 30 FPS minimum.

---

## Platform Requirements

| Property              | Phase 1 (Web Prototype)     | Phase 2 — PWA                  | Phase 3                 |
|-----------------------|-----------------------------|--------------------------------|-------------------------|
| Environment           | Desktop Browser (Chrome/Safari) | Mobile Browser (iOS / Android) | Mobile Browser          |
| Language              | HTML, CSS, Vanilla JS (ES6+)| HTML, CSS, Vanilla JS (ES6+)   | HTML, CSS, Vanilla JS   |
| Camera input          | `navigator.mediaDevices`    | `navigator.mediaDevices`       | `navigator.mediaDevices`|
| Model backend         | TensorFlow.js WebGL         | TensorFlow.js WebGL / WebGPU   | TensorFlow.js WebGL     |
| Target FPS            | 30                          | 30                             | 30                      |

---

## Technical Architecture

### Model

**Primary model: MoveNet MultiPose Lightning (TensorFlow.js)**
- Detects up to 6 people simultaneously (we use up to 5).
- 17 keypoints per person (COCO topology).
- Runs directly in the browser via TF.js. No server-side processing.

### Rendering

- **Canvas API:** HTML5 `<canvas>` API with 2D context.
- **Glow Effect:** Achieved using Canvas native `shadowBlur` and `shadowColor` properties, combined with `globalCompositeOperation = 'lighter'` for additive blending.

### Threading & Concurrency

- **Main Thread:** Handles UI, camera capture (`<video>` element), rendering to `<canvas>`, and recording via `MediaRecorder`.
- **Inference:** TensorFlow.js WebGL backend handles the model asynchronously without blocking the main UI thread. A `requestAnimationFrame` loop retrieves the latest pose and draws it.

### Music & Recording

- **Audio:** An HTML5 `<audio>` element handles music playback.
- **Recording:** Use `MediaRecorder` capturing a `MediaStream` from the `<canvas>` via `canvas.captureStream(30)`. Mix the audio track from the music element into this stream using the Web Audio API (`AudioContext`, `MediaElementAudioSourceNode`, `MediaStreamAudioDestinationNode`). Export the file and trigger a local download.

---

## Out of Scope

- Native App deployment (App Store / Play Store) - We are strictly PWA/Web.
- Direct TikTok SDK integration - Users will save the video and upload it manually.
- Python, OpenCV, or C++ integrations.
- Body masking or human silhouette segmentation.
- Real-time streaming to external platforms.
- More than 5 simultaneous people.
- Any premium asset functionality should be implemented in Phase 3.

---

## Agent Implementation Instructions

**IMPORTANT:** Follow the policy below when implementing the code in each phase.

### 1. Think Before Coding
**Don't assume. Don't hide confusion. Surface tradeoffs.**
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.

### 2. Simplicity First
**Minimum code that solves the problem. Nothing speculative.**
- No features beyond what was asked.
- Vanilla JS, no complex frameworks (React, Vue) unless explicitly requested.
- Keep all Phase 1 code strictly inside standard web files (`index.html`, `style.css`, `app.js`).

### 3. Surgical Changes
**Touch only what you must. Clean up only your own mess.**
- Match existing style, even if you'd do it differently.
- Remove imports/variables/functions that YOUR changes made unused.

### 4. Goal-Driven Execution
**Define success criteria. Loop until verified.**
Transform tasks into verifiable goals.

---

## Agent Phase Instructions

---

### Phase 1 — Web Prototype

Use these instructions for building the web application prototype. The code should be modular and object-oriented.

#### Step 1 — Environment Setup
Setup a modular web project using ES6 modules:
- `index.html` (UI structure, includes `<script type="module" src="app.js"></script>`)
- `style.css` (UI styling)
- `/js`
  - `config.js` (Centralized constants)
  - `/core/engine.js` (Main requestAnimationFrame loop and app state)
  - `/services/ml.js` (TensorFlow.js setup)
  - `/services/camera.js` (Webcam handling)
  - `/services/audio.js` (Web Audio API routing)
  - `/services/recorder.js` (MediaRecorder logic)
  - `/logic/tracker.js` (InstanceTracker)
  - `/logic/filters.js` (OneEuroFilter)
  - `/ui/dom.js` (DOM elements and event binding)
  - `/ui/renderer.js` (Canvas drawing)
- `app.js` (Entry point)

Include TensorFlow.js and the MoveNet MultiPose model via CDN in the `<head>` of `index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl"></script>
<script src="https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection"></script>
```

#### Step 2 — Camera & UI Initialization
- Access the user's webcam via `navigator.mediaDevices.getUserMedia({ video: true })` and attach it to a hidden `<video>` element.
- Create an HTML5 `<canvas>` that matches the video dimensions for rendering.
- Add UI controls: Start/Stop Camera, Background Toggle (Live/Black), Music Play/Stop, Start/Stop Recording.

#### Step 3 — Run MoveNet MultiPose Inference
- Initialize the pose detector: `poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING})`.
- In a `requestAnimationFrame` loop, call `detector.estimatePoses(videoElement)`.
- **Instance filtering:**
  - Only process instances where the confidence score is `> 0.2`.
  - Sort detected instances by score descending; take the top 5.

#### Step 4 — Temporal Smoothing
Apply a **One Euro Filter** (implemented in JS) independently to each keypoint's `x` and `y` coordinates for each tracked instance.
- **Instance Identity:** Assign each detected instance an ID based on proximity of their bounding box center to the previous frame's instances (nearest-neighbor matching). 

#### Step 5 — Neon Color Assignment
Assign one neon color per tracked instance ID. Colors persist across frames as long as the instance is matched.
Suggested palette:
`['#00FFFF', '#FF00FF', '#00FF00', '#FFA500', '#FFFF00', '#FF0000', '#0000FF', '#FFFFFF']`

#### Step 6 — Skeleton Rendering & Glow
**Keypoint connections (COCO 17-keypoint topology):**
Draw lines and circles on the canvas context (`ctx`).
For the glow effect:
- Set `ctx.shadowBlur = 15` (tune as needed).
- Set `ctx.shadowColor = instanceColor`.
- Set `ctx.globalCompositeOperation = "lighter"`.
- Set `ctx.lineWidth = 3` and `ctx.strokeStyle = instanceColor`.
- Draw the bones (lines) and joints (circles). Skip keypoints with a confidence score `< 0.3`.
- Reset `globalCompositeOperation = "source-over"` after drawing skeletons.

#### Step 7 — Background Toggle
Maintain a boolean flag `showCameraFeed`.
- If `true`: `ctx.drawImage(videoElement, 0, 0, width, height)` before drawing skeletons.
- If `false`: `ctx.fillStyle = "black"; ctx.fillRect(0, 0, width, height)`.

#### Step 8 — Music Playback
- Load an `<audio>` element with a sample MP3 track.
- Expose a button to Play/Pause the music.

#### Step 9 — Recording (Canvas + Audio)
- Use `canvas.captureStream(30)` to get the visual stream.
- Mix the audio track from the music element into this stream:
  - Create an `AudioContext`.
  - Create a `MediaElementAudioSourceNode` from the `<audio>` element.
  - Connect it to `audioContext.destination` (to hear it) AND to a `MediaStreamAudioDestinationNode`.
  - Extract the audio track from the destination node's stream.
- Combine the canvas video track and the audio track into a single `MediaStream`.
- Use `MediaRecorder` to record the combined stream.
- On stop, export as a WebM or MP4 file, create an object URL, and trigger a download via a dynamic `<a>` tag.

---

### Phase 2 — Mobile Web & PWA

> To be detailed after Phase 1 is validated. The architecture follows the exact same pipeline as Phase 1.

Key differences from Phase 1:
- Add a PWA manifest (`manifest.json`) and Service Worker to allow users to "Install to Home Screen".
- Ensure the UI is responsive (CSS Grid/Flexbox) for both portrait and landscape orientation on mobile.
- Add camera facing mode toggles (`facingMode: "user"` vs `"environment"`).
- Performance optimizations for mobile browsers (e.g. downscaling the video feed resolution before feeding it to TF.js if FPS drops).

---

### Phase 3 — Shape Customization (Premium)

> **Do not implement during Phase 1 or Phase 2.** This section defines the design contract so that the rendering architecture accommodates it in the future.

#### Overview
Phase 3 introduces a per-landmark shape layer. Instead of the neon stick skeleton, users can assign a visual asset — an SVG vector shape or PNG image — to any individual landmark. Each asset is positioned, scaled, and optionally rotated relative to its assigned landmark in real time.

#### Rendering Integration
- **Asset Types:** SVG or PNG images drawn onto the canvas using `ctx.drawImage()`.
- **Placement:** The asset is drawn centered on `(screen_x, screen_y)`.
- **Tilt (Rotation):** When enabled, the asset's rotation angle is derived from a reference landmark pair (e.g. left eye to right eye). The angle is `Math.atan2(dy, dx)` between the two reference points.
- **Pipeline:** The Phase 1 skeleton renderer must expose a per-landmark override hook so Phase 3 can inject assets (via `ctx.translate` and `ctx.rotate`) without modifying the core TF.js inference loop.
