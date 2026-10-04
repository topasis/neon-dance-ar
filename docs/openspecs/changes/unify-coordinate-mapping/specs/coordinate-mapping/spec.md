## ADDED Requirements

### Requirement: Single video-to-canvas mapping
All drawing of keypoints SHALL go through one mapping from video coordinates to canvas coordinates.

#### Scenario: Canvas size differs from video size
- **WHEN** the canvas is a different size from the video frame
- **THEN** skeletons are drawn exactly over the people in the scaled background

### Requirement: Mirrored front camera
When `CONFIG.CAMERA.MIRROR_FRONT` is true and the user-facing camera is active, the background video and skeletons
SHALL both be drawn mirrored horizontally.

#### Scenario: Raise right hand
- **WHEN** the user faces the front camera and raises their right hand
- **THEN** the raised hand appears on the right side of the screen, like a mirror
- **AND** the skeleton stays aligned with the body

#### Scenario: Mirroring disabled
- **WHEN** `MIRROR_FRONT` is false
- **THEN** video and skeletons are drawn unmirrored and aligned
