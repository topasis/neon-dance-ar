# Change: MP4-first recording with Web Share on mobile

See `docs/adr/0003-recording-format-and-sharing-on-mobile.md`.

## Why
- A1: the audio track is only added if music is playing when recording starts (`engine.js:81`).
- A2: Safari may produce empty MP4s from a canvas stream with no audio track (WebKit bug 290002).
- A3: WebM is preferred (`recorder.js:18-20`); iOS < 18.4 only records MP4, and MP4 is what galleries and social apps expect.
- A4: the file is always named `.webm` (`recorder.js:46`).
- A5: on iOS `<a download>` saves to Files, not Photos; the object URL is revoked synchronously (`recorder.js:48`).
- A6: `captureStream(30)` ignores `CONFIG.CAMERA.FPS` (`recorder.js:10`).
- A8: the iPhone silent switch may mute Web Audio playback.

## What Changes
- MIME preference: `video/mp4;codecs=avc1,mp4a.40.2` → `video/mp4` → `video/webm;codecs=vp9,opus` → `video/webm`;
  file extension derived from the chosen type.
- `AudioService` exposes `ensureRouting()` that creates the `AudioContext`, `MediaElementAudioSourceNode` and
  `MediaStreamAudioDestinationNode`. It is called from the record button's click handler, and the recorder always
  receives the destination's audio track, so music started later is recorded.
- On stop, the recorder returns the `Blob` instead of auto-downloading. The UI shows a "Save / Share" button:
  - if `navigator.canShare?.({ files: [file] })` → `navigator.share({ files: [file] })`;
  - otherwise download via `<a download>`, revoking the object URL after a delay.
- Use `CONFIG.CAMERA.FPS` for `captureStream`.
- Set `navigator.audioSession.type = 'playback'` where supported, before playing music.

## Open question
A7: recordings are held in memory. Should there be a maximum recording length (e.g. 3 minutes) to avoid memory
pressure on phones? Not included unless confirmed.

## Impact
- Affected specs: `recording`
- Affected code: `js/services/recorder.js`, `js/services/audio.js`, `js/core/engine.js`, `js/ui/dom.js`, `index.html`, `style.css`
- `CLAUDE.md` Phase 1 Step 9 must be updated.
