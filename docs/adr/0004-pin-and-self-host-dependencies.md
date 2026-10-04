# ADR 0004 — Pin and self-host TF.js and model weights

- **Status:** Proposed
- **Date:** 2026-10-05

## Context

`index.html` loads TF.js and `pose-detection` from jsDelivr **without version numbers**, so every page load can
pick up a different release. The MoveNet weights are fetched at runtime from Google's model hosting by
`createDetector()`. For a mobile PWA this means:

- An upstream release can break the app with no code change on our side.
- The PWA can't start offline or on a flaky mobile connection: the libraries and the model are third-party
  requests the service worker doesn't control well (opaque cross-origin responses, no versioned cache key).
- First load on cellular depends on two extra origins.

## Decision

1. **Pin exact versions** of `@tensorflow/tfjs-core`, `@tensorflow/tfjs-converter`, `@tensorflow/tfjs-backend-webgl`
   and `@tensorflow-models/pose-detection`, and keep them in one place.
2. **Self-host** those scripts under `vendor/` and the MoveNet MultiPose Lightning model files (`model.json` +
   weight shards) under `models/`, served from the same origin. Pass the local `modelUrl` to `createDetector()`.
3. **Pre-cache** `vendor/` and `models/` in the Phase 2 service worker, keyed by version, so upgrades are explicit.

No build step or package manager is introduced; the files are downloaded once and committed (or fetched by a
`make vendor` target).

## Consequences

- Reproducible behaviour across devices and over time; upgrades are a deliberate change.
- The app works offline after the first visit, which "Install to Home Screen" users expect.
- The repository grows by the size of the libraries and model weights.
- `CLAUDE.md` Phase 1 Step 1 (unversioned CDN tags) should be updated.
