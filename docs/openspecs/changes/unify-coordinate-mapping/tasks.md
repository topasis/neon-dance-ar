# Tasks

- [ ] 1.1 Confirm the open question (mirror recordings or not).
- [ ] 1.2 Add `CONFIG.CAMERA.MIRROR_FRONT`.
- [ ] 1.3 Implement the video→canvas mapping (scale from `videoWidth/Height` to `canvas.width/height`, then optional mirror).
- [ ] 1.4 Apply the mirror transform when drawing the background video in `renderBackground`.
- [ ] 1.5 Map every keypoint through the mapping in `renderSkeletons` / landmark drawers; no other code draws raw coordinates.
- [ ] 1.6 Verify: raise your right hand with the front camera — the skeleton's hand on screen moves on the same
      side as in a mirror, and skeleton overlays the body exactly in both Live and Black background.
