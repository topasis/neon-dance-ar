# Tasks

- [ ] 1.1 Pick the latest stable version of each package and check they're compatible with each other.
- [ ] 1.2 Add `make vendor` that downloads the pinned builds and model files (versions written once in the Makefile).
- [ ] 1.3 Decide whether `vendor/` and `models/` are committed or git-ignored and fetched by `make vendor`; document it.
- [ ] 1.4 Update `index.html:8-11` to load from `vendor/` with `defer`.
- [ ] 1.5 Pass `modelUrl` in `ml.js`.
- [ ] 1.6 Update `CLAUDE.md` Phase 1 Step 1.
- [ ] 1.7 Verify: with the network tab, no requests go to jsdelivr or Google model hosting; app works as before.
