## ADDED Requirements

### Requirement: Single smoothing and tracking stage
Keypoint smoothing and identity tracking SHALL be done only by the app's `InstanceTracker` and One Euro filters;
the pose-detection library's built-in smoothing and tracking SHALL be disabled.

#### Scenario: Detector configuration
- **WHEN** the detector is created
- **THEN** `enableSmoothing` and `enableTracking` are `false`

### Requirement: Global nearest-first matching
Each frame, the tracker SHALL match detections to existing instances by ascending distance across all pairs,
within a threshold relative to the instance's bounding-box size.

#### Scenario: Two people cross
- **WHEN** person A and person B walk past each other
- **THEN** each keeps the same instance ID and colour before and after crossing

### Requirement: Resolution-independent matching distance
(Moved from `unify-coordinate-mapping`, finding C3.)
The maximum tracker matching distance SHALL be defined relative to the person's bounding-box size, not in fixed pixels.

#### Scenario: Different camera resolutions
- **WHEN** the same scene is captured at 640×480 and at 1280×720
- **THEN** the same people are matched across frames in both cases

### Requirement: Invalid poses ignored
Poses with no keypoint above the confidence threshold SHALL NOT be tracked.

#### Scenario: Empty pose near the corner
- **WHEN** a pose has no confident keypoints
- **THEN** it creates no instance and matches no existing instance

### Requirement: Unique colours per visible person
A new instance SHALL receive the first palette colour not used by any currently tracked instance, and keep it while tracked.

#### Scenario: First person
- **WHEN** the first person is detected
- **THEN** their colour is `#00FFFF`

#### Scenario: Five people
- **WHEN** five people are tracked at the same time
- **THEN** all five colours are different

### Requirement: No frozen ghosts
An unmatched instance SHALL remain available for re-matching for `GRACE_PERIOD_FRAMES` but SHALL only be drawn for
`RENDER_GRACE_FRAMES`.

#### Scenario: Person leaves the frame
- **WHEN** a person walks out of view
- **THEN** their skeleton disappears after at most `RENDER_GRACE_FRAMES` frames

#### Scenario: One-frame dropout
- **WHEN** a person is missed for one frame and detected again
- **THEN** they keep the same ID and colour and the skeleton doesn't flicker

### Requirement: Low-confidence keypoints don't move filters
Keypoints below `MIN_CONFIDENCE` SHALL NOT update their One Euro filter state.

#### Scenario: Occluded wrist
- **WHEN** a wrist is occluded and reported with a low score at a wrong position
- **THEN** the wrist's filtered position is unchanged and the wrist isn't drawn

### Requirement: Injected timestamps
The tracker SHALL use a timestamp passed by the caller for filtering.

#### Scenario: Deterministic test
- **WHEN** the same poses and timestamps are fed to two new trackers
- **THEN** both return identical instances
