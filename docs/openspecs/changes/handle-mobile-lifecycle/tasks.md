# Tasks

- [ ] 1.1 Add a `document.visibilitychange` handler in the engine implementing hidden/visible behaviour.
- [ ] 1.2 In `CameraService.start()`, attach an `ended` listener to the video track and expose an `onEnded` callback.
- [ ] 1.3 In `CameraService.start()`, await `video.play()`, add a metadata timeout, and let errors propagate with their `name`.
- [ ] 1.4 In `engine.toggleCamera`, map error names to status messages.
- [ ] 1.5 Add `CONFIG.MODEL.MAX_CONSECUTIVE_FAILURES`; count failures in `PoseDetector`; add `PoseDetector.reset()`
      that disposes the detector and re-inits.
- [ ] 1.6 Listen to the video `resize` event and call `renderer.resize()`.
- [ ] 1.7 Add `AudioService.resume()` used on visibility return.
- [ ] 1.8 Verify on device: lock/unlock during preview, switch apps during recording, rotate the phone, open the
      camera in another app while running.
