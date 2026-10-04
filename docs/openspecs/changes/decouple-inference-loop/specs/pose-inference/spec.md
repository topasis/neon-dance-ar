## ADDED Requirements

### Requirement: Rendering independent of inference
The preview SHALL be redrawn on every animation frame using the most recent tracked poses, without waiting for
pose estimation to finish.

#### Scenario: Slow inference
- **WHEN** a pose estimate takes longer than one display frame
- **THEN** the canvas keeps updating the background every animation frame
- **AND** skeletons update as soon as the estimate resolves

### Requirement: One estimate at a time
The app SHALL run at most one pose estimate concurrently, starting the next one only after the previous one resolves.

#### Scenario: Back-to-back estimates
- **WHEN** an estimate resolves
- **THEN** the next estimate starts on the current video frame
- **AND** there are never two estimates in progress

### Requirement: Bounded model input
The model input size SHALL be bounded by a configurable maximum dimension (multiple of 32, default 256).

#### Scenario: Default configuration
- **WHEN** the detector is created with default config
- **THEN** `multiPoseMaxDimension` is 256

### Requirement: Pose filtering in the ML service
The ML service SHALL return only poses with score > 0.2, sorted by score descending, at most 5.

#### Scenario: Seven people detected
- **WHEN** the model returns 7 poses, 6 with score > 0.2
- **THEN** the 5 highest-scoring of those 6 are passed to the tracker

### Requirement: Inference only on ready video
The app SHALL NOT run pose estimation before the video element has current frame data.

#### Scenario: Camera just started
- **WHEN** `video.readyState` is below `HAVE_CURRENT_DATA`
- **THEN** no estimate is run and no error is logged

### Requirement: Backend selection with fallback
The app SHALL use the configured TF.js backend and fall back to WebGL if it fails to initialise. WebGL SHALL be the default.

#### Scenario: WebGPU unavailable
- **WHEN** the config requests `'webgpu'` and `tf.setBackend('webgpu')` fails
- **THEN** the app initialises the `'webgl'` backend and continues
