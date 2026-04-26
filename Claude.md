# Neon Dance AR

## Overview

A real-time mobile AR application for iOS and Android that records video and replaces the user's body with a "glow-in-the-dark" (neon) skeleton. The app targets the viral "stickman dance" trend, removing the need for physical EL-wire or LED suits by using AI-driven pose estimation, body segmentation masking, and specialized rendering shaders.

---

## Core Features

1. **Real-Time Pose Estimation:** Robust, low-latency tracking of 33 body landmarks at 30–60 FPS.
2. **Body Masking:** The user's physical body is erased from the frame using a segmentation mask, leaving only the background and the neon skeleton visible.
3. **Neon Visualization:** A glowing skeletal overlay rendered using additive blending and a bloom post-processing pass.
4. **Live Preview:** Zero-copy GPU pipeline to display the full AR effect in real time.
5. **Recording & Sharing:** High-quality H.264/MP4 recording with audio, with sharing support for TikTok and WhatsApp.

---

## Platform Requirements

| Property | iOS | Android |
|---|---|---|
| Minimum OS | iOS 15 | Android 8.0 (API 26) |
| Target OS | iOS 17 | Android 13 (API 33) |
| Architecture | arm64 | arm64-v8a |
| GPU Delegate | Core ML | TFLite GPU |
| Low-end fallback | model_complexity=0, 30 FPS cap | model_complexity=0, 30 FPS cap |

---

## Technical Architecture

1. **Model:** MediaPipe Pose (BlazePose Full, `model_complexity=1`) for 33-keypoint topology and 3D World Landmarks. Fall back to Lite (`model_complexity=0`) on low-end devices.
2. **Segmentation:** MediaPipe Pose segmentation mask (the `segmentation_mask` output) used to erase the user's body silhouette from the composited frame.
3. **Stabilization:** One Euro Filter applied per-landmark with `min_cutoff=1.0` and `beta=0.1` as starting values. These should be tunable at runtime.
4. **Threading:** Three-thread pipeline — Camera Capture, ML Inference, and AR Rendering — to ensure UI responsiveness.
5. **Rendering Engine:** Native shaders (Metal on iOS, OpenGL ES 3.0 / Vulkan on Android). Do **not** use Unity for this project; native rendering avoids engine overhead and integrates cleanly with platform recording APIs.
6. **Graphics:** Additive blending + Gaussian bloom post-processing pass for the neon glow effect.

---

## Out of Scope

- Web or desktop versions
- Multi-person tracking (the app targets a single user in frame; if multiple people are detected, track only the most centered/prominent person)
- Face or hand landmark tracking beyond what BlazePose provides
- Real-time streaming to external platforms
- In-app video editing

---

## Agent Implementation Instructions

### Task
Develop a mobile AR application that performs real-time body replacement with a neon skeleton effect, for both iOS and Android.

---

### Step 1 — Set Up Permissions

Before initializing any pipeline, handle all required permissions at app launch:

- **Camera:** Required for live preview and pose estimation.
- **Microphone:** Required for audio track in video recording.
- **Photo Library / Storage:**
  - iOS: `NSPhotoLibraryAddUsageDescription` (write-only is sufficient).
  - Android: `WRITE_EXTERNAL_STORAGE` (API ≤ 28) or `MediaStore` API (API ≥ 29).

If any permission is denied, display a non-blocking prompt explaining why it is needed, with a deep-link to system settings.

---

### Step 2 — Set Up the Machine Learning Pipeline

**Model selection:**
- Integrate MediaPipe Pose (BlazePose).
- Default to `model_complexity=1` (Full) for devices with ≥ 4 GB RAM.
- Fall back to `model_complexity=0` (Lite) for devices with < 4 GB RAM or below the minimum OS version.

**Running mode:**
- Set the task to `LIVE_STREAM` mode for asynchronous, non-blocking frame processing.
- Frames dropped by the ML pipeline should not block the rendering thread.

**Outputs to use:**
- `NormalizedLandmarks` — for 2D screen-space overlay of the skeleton.
- `WorldLandmarks` (meters) — for depth-aware occlusion during 3D movements.
- `segmentation_mask` — a per-pixel float mask (0.0 = background, 1.0 = person). **This output is required for body erasure in Step 4.**

**GPU delegates:**
- Android: Enable the TFLite GPU delegate (`GpuDelegateV2`).
- iOS: Enable the Core ML delegate.

**No-detection fallback:**
- If no person is detected for > 500 ms, fade out the skeleton and display the raw camera feed with a subtle UI indicator ("Move into frame").

---

### Step 3 — Implement Temporal Smoothing

**Jitter reduction:**
- Apply a One Euro Filter independently to each of the 33 keypoints (x, y, z axes separately).
- Starting parameters: `min_cutoff = 1.0`, `beta = 0.1`, `d_cutoff = 1.0`.
- These values must be exposed as runtime-tunable constants (not hardcoded) to allow tuning during QA.
- The filter is adaptive by design: it applies more smoothing during slow/held poses and reduces smoothing lag during fast dance moves.

**Visibility thresholding:**
- Each landmark has a `visibility` score from 0.0 to 1.0.
- Do not render any bone connection if either endpoint landmark has `visibility < 0.5`.
- Fade the bone opacity linearly between `visibility` values of 0.5 and 0.8 (fully opaque at 0.8+).

---

### Step 4 — Implement Body Masking (Segmentation)

This step is what makes the skeleton appear to *replace* the body rather than simply overlay it.

1. Receive the `segmentation_mask` output from MediaPipe Pose as a float texture.
2. Apply a slight Gaussian blur (σ = 2px) to the mask edges to prevent hard aliasing at the silhouette boundary.
3. In the compositing shader, use the mask to:
   - **Erase the user's body:** Multiply the camera frame pixels by `(1.0 - mask_value)`. This blacks out the human silhouette.
   - **Preserve the background:** Background pixels (where `mask_value ≈ 0.0`) pass through unmodified.
4. The neon skeleton is then rendered on top of this composited frame using additive blending (see Step 5).

> ⚠️ If `segmentation_mask` output is unavailable on a specific device tier, fall back to rendering the skeleton as a transparent overlay (no body erasure). This should be logged and flagged in analytics.

---

### Step 5 — Develop the Neon Rendering Engine

**Skeletal mapping:**
- Connect joints using the standard MediaPipe Pose connection list (e.g., LEFT_SHOULDER → LEFT_ELBOW → LEFT_WRIST for the left arm).
- Render joint nodes as filled circles (radius: 6–8px at 1080p).
- Render bone connections as anti-aliased line segments (width: 4–6px at 1080p).

**Neon color palette (defaults, must be user-selectable):**
- Cyan `#00FFFF` — arms
- Magenta `#FF00FF` — legs
- White `#FFFFFF` — spine and head connections

**Shader — additive blending:**
- Use the following blending equation at the shader level:
```
  Output = (SkeletonColor × SkeletonAlpha) + DestinationColor
```
  This makes the skeleton appear as an emissive light source that brightens whatever is behind it.
- In GLSL: `gl_FragColor = skeletonColor + texture2D(backgroundTex, uv);` (clamp to [0,1]).

**Bloom post-processing:**
1. Render the neon skeleton to an off-screen framebuffer (FBO) at half resolution.
2. Apply a two-pass Gaussian blur (horizontal then vertical) to the FBO. Use 9-tap or 13-tap kernel.
3. On low-end devices: reduce to a 5-tap blur or switch to a Kawase blur for fewer texture samples.
4. Composite the blurred FBO back over the masked camera frame using additive blending.
5. Bloom intensity and radius should be exposed as tunable parameters.

---

### Step 6 — Configure Mobile Multi-Threading

Maintain three independent threads with the following responsibilities:

| Thread | Responsibilities |
|---|---|
| **Camera Thread** | Capture frames from the camera. Convert YUV → RGB using `ExternalTextureConverter` (Android) or `CVPixelBuffer` (iOS). Push frames to the inference queue. |
| **Inference Thread** | Run MediaPipe asynchronously. Receive pose and segmentation results via callback. Push latest results to a thread-safe result buffer (use a lock-free ring buffer or atomic pointer swap). |
| **Render Thread** | Read the latest result buffer. Update skeleton positions and segmentation mask. Execute the full render pipeline at the target frame rate (60 FPS on capable devices, 30 FPS on low-end). |

- The render thread must never block waiting on the inference thread. If new results are not available, render using the last known valid keypoint positions.
- Camera and rendering threads should be pinned to performance cores where the OS allows.

---

### Step 7 — Recording and Sharing Integration

**Audio + Video recording:**
- Android: Use `MediaRecorder` or `MediaCodec` with `AudioRecord` for simultaneous audio capture.
- iOS: Use `AVAssetWriter` with both `AVAssetWriterInput` for video and a separate `AVAssetWriterInput` for audio (from `AVCaptureAudioDataOutput`).

**Output settings:**
- Resolution: 1080 × 1920 (9:16 portrait)
- Codec: H.264, Baseline Profile, CRF-equivalent quality 23
- Audio: AAC, 44.1 kHz, stereo
- Container: MP4

**Source frame for recording:**
- Record from the fully composited AR frame buffer (post-segmentation masking + post-bloom), not the raw camera feed.

**Social sharing:**
- **TikTok:** Integrate the TikTok Open Platform SDK (see [developers.tiktok.com](https://developers.tiktok.com)). Use the Video Kit API to allow direct in-app posting. Pre-populate hashtags: `#NeonDance #StickmanChallenge`.
- **WhatsApp and general sharing:**
  - Android: `Intent.ACTION_SEND` with MIME type `video/mp4`.
  - iOS: `UIActivityViewController` with the output MP4 URL.

---

### Step 8 — Performance Optimization

**Model precision:**
- Use `float16` quantization as the default.
- Use `int8` quantization on devices that support it, and where accuracy loss is validated to be acceptable via automated testing.

**Adaptive quality:**
- Monitor frame time each render tick. If the render thread drops below 25 FPS for > 1 second:
  1. First: reduce bloom blur kernel from 13-tap to 5-tap.
  2. Second: reduce segmentation mask resolution to half.
  3. Third: switch ML model to `model_complexity=0`.

**Thermal management:**
- Monitor device thermal state (iOS: `ProcessInfo.thermalState`; Android: `PowerManager` thermal API).
- On `SERIOUS` / `CRITICAL` thermal state: cap frame rate to 30 FPS and drop to Lite model complexity.

**App lifecycle:**
- On app backgrounding: immediately pause the camera, inference, and rendering threads.
- Release GPU resources when the app moves to background for > 5 seconds.
- Restore all pipelines on foreground with a cold-start sequence.

---

## Key Dependencies

| Component | Android | iOS |
|---|---|---|
| Pose Estimation | MediaPipe Tasks for Android | MediaPipe Tasks for iOS |
| GPU Acceleration | TFLite GPU Delegate (GpuDelegateV2) | Core ML Delegate |
| Rendering | OpenGL ES 3.0 / Vulkan | Metal |
| Video Recording | MediaCodec + AudioRecord | AVAssetWriter |
| Sharing | TikTok Open Platform SDK, Intent API | TikTok Open Platform SDK, UIActivityViewController |