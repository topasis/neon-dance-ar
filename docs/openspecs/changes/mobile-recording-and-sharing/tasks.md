# Tasks

- [ ] 1.1 Add MIME preference list and `mimeType → extension` mapping in `recorder.js`.
- [ ] 1.2 Split `AudioService.setupRouting()` into `ensureRouting()` (idempotent) and playback; call `ensureRouting()`
      from the record click handler.
- [ ] 1.3 Engine always passes `audio.getStream()` to the recorder.
- [ ] 1.4 `RecorderService.stop()` returns a Promise resolving to `{ blob, filename }`; remove auto-download from `onstop`.
- [ ] 1.5 Add a hidden "Save / Share" button in `index.html`; show it when a recording is ready; add it to app state
      (`centralize-app-state`).
- [ ] 1.6 Implement share with download fallback; revoke the object URL after a timeout.
- [ ] 1.7 Use `CONFIG.CAMERA.FPS` in `captureStream`.
- [ ] 1.8 Set `navigator.audioSession.type = 'playback'` if `navigator.audioSession` exists.
- [ ] 1.9 Update `CLAUDE.md` Phase 1 Step 9.
- [ ] 1.10 Verify on iPhone (Safari) and Android (Chrome): record without music, record and start music midway;
      both files play with correct sound, open in Photos/Gallery, and can be shared to TikTok.
