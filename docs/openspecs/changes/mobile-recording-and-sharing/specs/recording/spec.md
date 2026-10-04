## ADDED Requirements

### Requirement: MP4-first recording format
The recorder SHALL use the first supported type from: `video/mp4;codecs=avc1,mp4a.40.2`, `video/mp4`,
`video/webm;codecs=vp9,opus`, `video/webm`, and SHALL name the file with the matching extension.

#### Scenario: iOS Safari
- **WHEN** recording on iOS Safari
- **THEN** the file is an `.mp4` with H.264 video and AAC audio

#### Scenario: WebM-only browser
- **WHEN** the browser doesn't support MP4 recording
- **THEN** the file is a `.webm`

### Requirement: Recording always has an audio track
Every recording SHALL include the music audio track, whether or not music is playing when recording starts.

#### Scenario: Music started mid-recording
- **WHEN** the user starts recording and then starts the music
- **THEN** the saved video contains the music from the moment it started

#### Scenario: No music
- **WHEN** the user records without playing music
- **THEN** the saved video plays with silent audio and isn't empty

### Requirement: Save or share after recording
After a recording stops, the app SHALL offer a "Save / Share" action that uses the Web Share API with files when
available and falls back to a file download.

#### Scenario: iPhone
- **WHEN** the user taps "Save / Share" on iOS Safari
- **THEN** the system share sheet opens with the video, offering "Save Video" and installed apps

#### Scenario: Desktop without file sharing
- **WHEN** `navigator.canShare({ files })` is false or unavailable
- **THEN** the video is downloaded with the correct extension

### Requirement: Recording frame rate from config
The canvas capture frame rate SHALL come from `CONFIG.CAMERA.FPS`.

#### Scenario: Config change
- **WHEN** `CONFIG.CAMERA.FPS` is changed
- **THEN** `captureStream` uses the new value

### Requirement: Music audible with silent switch
Where `navigator.audioSession` is supported, the app SHALL set its type to `'playback'` before playing music.

#### Scenario: iPhone ringer off
- **WHEN** the iPhone's silent switch is on and the user plays music
- **THEN** the music is audible
