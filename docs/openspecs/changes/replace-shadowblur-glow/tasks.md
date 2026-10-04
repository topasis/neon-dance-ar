# Tasks

- [ ] 1.1 Add `CONFIG.RENDER.GLOW_SCALE` and `GLOW_LINE_WIDTH`; remove `GLOW_BLUR`.
- [ ] 1.2 Create the offscreen glow canvas in `Renderer` and resize it in `resize()`.
- [ ] 1.3 Refactor drawing so the bone/joint/decorator passes can target either context.
- [ ] 1.4 Implement glow pass → upscale composite → crisp pass.
- [ ] 1.5 Remove all `shadowBlur` / `shadowColor` code.
- [ ] 1.6 Update `CLAUDE.md` rendering sections.
- [ ] 1.7 Verify: side-by-side screenshot against the old look on Live and Black backgrounds; measure render FPS
      with 5 people on an iPhone and an Android phone before/after.
