# ADR 0003 — Recording format and saving/sharing on mobile

- **Status:** Proposed
- **Date:** 2026-10-05

## Context

Users record a dance and upload it to TikTok or similar by hand. Today the recorder prefers WebM
(`video/webm; codecs=vp9`), always names the file `.webm`, and saves it by clicking a hidden `<a download>`
(`js/services/recorder.js`). On phones this has problems:

- **Format.** MP4 (H.264 + AAC) is what phone galleries and social apps handle best. Safari only gained WebM
  recording in iOS 18.4; on iOS 14.3–18.3 MP4 is the only option. Chrome can record MP4 too.
- **Missing audio track.** The audio track is only added if music is already playing when recording starts.
  WebKit has a reported bug where MP4 recordings of a `canvas.captureStream()` *without* an audio track come out
  empty (WebKit bug 290002).
- **Saving.** On iOS, `<a download>` of a blob goes to the Files app, not Photos, so the user can't easily pick the
  clip in TikTok. The object URL is also revoked right after the click, which can break the download.

## Decision

1. **Prefer MP4, fall back to WebM.** Pick the first supported type from:
   `video/mp4;codecs=avc1,mp4a.40.2` → `video/mp4` → `video/webm;codecs=vp9,opus` → `video/webm`.
   Derive the file extension from the chosen MIME type.
2. **Always record an audio track.** Create the `AudioContext` and `MediaStreamAudioDestinationNode` when recording
   starts (inside the click handler) and add its track whether or not music is playing. Music started later flows
   into the same track, and Safari never sees a video-only stream.
3. **Share via the Web Share API, fall back to download.** When recording stops, keep the `Blob` and show a
   "Save / Share" button. Tapping it calls `navigator.share({ files: [file] })` if
   `navigator.canShare({ files: [file] })` is true (lets iOS users "Save Video" to Photos or send it straight to
   TikTok); otherwise use the existing `<a download>`. Revoke the object URL only after the download has started
   (e.g. on a timeout), not synchronously.

The share happens on a second tap because `navigator.share()` needs a fresh user gesture, and `MediaRecorder`'s
`onstop` fires asynchronously after the "Stop" tap.

## Consequences

- Recordings open natively in iOS Photos and Android galleries and are accepted by social apps.
- One extra tap after stopping a recording.
- Desktop behaviour is unchanged where Web Share with files isn't available (download fallback).
- Fixes the "music started mid-recording isn't recorded" issue as a side effect.
- `CLAUDE.md` Phase 1 Step 9 should say MP4-first and describe the share step.
