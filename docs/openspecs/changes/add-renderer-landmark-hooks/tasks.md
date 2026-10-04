# Tasks

- [ ] 1.1 Add `landmarkOverrides` (Map) and `decorators` (array) to `Renderer`, with setter/clear/add methods.
- [ ] 1.2 In the joint pass, call the override (wrapped in `save/translate/restore`) instead of the circle when one exists.
- [ ] 1.3 Move `renderCircleAroundFace` into a decorator registered by the engine at startup.
- [ ] 1.4 Make sure decorators and overrides receive canvas-mapped coordinates.
- [ ] 1.5 Verify: face circle looks the same as before; a temporary test override (e.g. a square on the nose) draws
      centred on the nose and follows mirroring. Remove the test override afterwards.
