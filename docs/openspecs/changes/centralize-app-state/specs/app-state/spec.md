## ADDED Requirements

### Requirement: Single source of app state
The engine SHALL hold the app state (model, camera, recording, music, background mode) in one object, and the UI
SHALL be rendered from that object only.

#### Scenario: UI reflects state
- **WHEN** any state field changes
- **THEN** every button's label, active styling and enabled flag match the new state

### Requirement: Camera control gating
The camera control SHALL be disabled until the pose model has loaded, and SHALL ignore input while the camera is starting.

#### Scenario: Model still loading
- **WHEN** the page has loaded but the model has not finished loading
- **THEN** the "Start Camera" button is disabled

#### Scenario: Double tap on start
- **WHEN** the user taps "Start Camera" twice before the camera has started
- **THEN** exactly one camera stream is opened

### Requirement: Recording never outlives the camera
Stopping the camera SHALL stop an active recording and export it.

#### Scenario: Stop camera while recording
- **WHEN** a recording is active and the user taps "Stop Camera"
- **THEN** the recording stops and the video file is offered to the user
- **AND** the record button returns to "Start Recording" and is disabled

### Requirement: No drawing after stop
Once the camera is stopped, no further frames SHALL be drawn to the canvas.

#### Scenario: Inference in flight at stop
- **WHEN** the user stops the camera while a pose estimate is in progress
- **THEN** the canvas stays cleared after the estimate resolves
- **AND** no new animation frame is scheduled
