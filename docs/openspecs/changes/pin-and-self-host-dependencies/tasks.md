# Tasks

- [x] 1.1 Pick the latest stable version of each package and check they're compatible with each other.
  (tfjs-core/converter/backend-webgl/backend-webgpu 4.22.0, pose-detection 2.1.3)
- [x] 1.2 Add `make vendor` that downloads the pinned builds and model files (versions written once in the Makefile).
- [x] 1.3 Decide whether `vendor/` and `models/` are committed or git-ignored and fetched by `make vendor`; document it.
  (Committed; `make vendor` re-fetches them. Documented in the Makefile and `CLAUDE.md`.)
- [x] 1.4 Update `index.html:8-11` to load from `vendor/` with `defer`.
- [x] 1.5 Pass `modelUrl` in `ml.js`.
- [x] 1.6 Update `CLAUDE.md` Phase 1 Step 1.
- [ ] 1.7 Verify: with the network tab, no requests go to jsdelivr or Google model hosting; app works as before.
  (Headless Chrome: all scripts and model files served locally, model loads, no jsdelivr/tfhub/Kaggle requests.
  Still to check by hand: live camera + skeleton rendering + recording behave as before.)
