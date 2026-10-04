## ADDED Requirements

### Requirement: Background handling
When the page becomes hidden the app SHALL stop any active recording (exporting the file), pause music and pause
inference. When it becomes visible again it SHALL resume or report the camera state accurately.

#### Scenario: Switch apps while recording
- **WHEN** a recording is active and the user switches to another app
- **THEN** the recording stops and the file is kept for the user to save
- **AND** the music is paused

#### Scenario: Return with a live camera
- **WHEN** the user returns to the app and the camera track is still live
- **THEN** inference resumes and skeletons are drawn again

#### Scenario: Return with a dead camera
- **WHEN** the user returns to the app and the camera track has ended
- **THEN** the camera state is `off`, the camera button reads "Start Camera", and the status explains why

### Requirement: Camera disconnect detection
The app SHALL detect when the camera track ends and move to the camera-off state.

#### Scenario: Another app takes the camera
- **WHEN** the camera track fires `ended`
- **THEN** recording (if any) stops, the camera state is `off`, and the status shows "Camera disconnected"

### Requirement: Inference recovery
The app SHALL re-initialise the pose detector after a configurable number of consecutive inference failures.

#### Scenario: GPU context lost
- **WHEN** `estimatePoses` fails 5 times in a row
- **THEN** the detector is disposed and re-initialised, and the status shows a recovery message
- **AND** if re-initialisation fails, the status shows an error and inference stops

### Requirement: Orientation changes
The canvas SHALL match the video's current dimensions.

#### Scenario: Rotate phone
- **WHEN** the device rotates and the video dimensions change
- **THEN** the canvas is resized to the new dimensions and skeletons stay aligned with people

### Requirement: Camera start errors
Camera start SHALL either resolve with a playing video or reject with a specific error message.

#### Scenario: Permission denied
- **WHEN** the user denies camera permission
- **THEN** the status shows that permission was denied

#### Scenario: Camera busy
- **WHEN** the camera is in use by another app (`NotReadableError`)
- **THEN** the status shows that the camera is in use

#### Scenario: Metadata never loads
- **WHEN** video metadata hasn't loaded within the timeout
- **THEN** camera start rejects, the stream is stopped, and the camera state returns to `off`
