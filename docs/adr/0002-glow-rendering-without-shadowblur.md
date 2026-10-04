# ADR 0002 — Glow rendering without per-stroke `shadowBlur`

- **Status:** Proposed
- **Date:** 2026-10-05

## Context

The neon glow is produced by setting `ctx.shadowBlur = 15` and stroking each bone and joint
(`js/ui/renderer.js`). With 5 people that is roughly 5 × (16 bones + 17 joints + face ring) ≈ 170 blurred draw
calls per frame. Canvas shadow blur is computed per draw call and is a known slow path in WebKit
(e.g. WebKit bug 120346); mobile GPUs and iOS Safari are where this hurts most. The cost is paid every frame on
top of inference, so it competes directly with the 30 FPS target.

Options considered:

| Option | Mobile cost | Notes |
|---|---|---|
| `shadowBlur` per stroke — current | High, scales with draw calls | Simple, but the main rendering risk on phones. |
| `ctx.filter = 'blur(..)'` | One blur per frame | Not reliably available in Safari's 2D canvas; can't be the baseline. |
| WebGL renderer with bloom shader | Lowest | Large rewrite; conflicts with "Canvas 2D" simplicity and the Phase 3 `drawImage` hook. |
| **Downscaled glow layer** | One small offscreen draw + one upscale per frame | Plain Canvas 2D, works everywhere. |

## Decision

Replace per-stroke `shadowBlur` with a **downscaled glow layer**, still in Canvas 2D:

1. Draw all skeletons with thicker lines into a small offscreen canvas (e.g. 1/4 of the output size).
2. Draw that canvas onto the main canvas scaled up, with `globalCompositeOperation = 'lighter'`. The browser's
   bilinear upscale softens it into a halo.
3. Draw the crisp, thin skeleton lines on top with `'lighter'`, no shadow.

Glow strength is tuned through config values (layer scale, glow line width) instead of `GLOW_BLUR`.

## Consequences

- Glow cost becomes roughly constant per frame instead of growing with people × bones.
- The look is close to, but not identical to, `shadowBlur`; it needs a visual check on device.
- Additive blending (`'lighter'`) and the per-instance colours are unchanged.
- The Phase 3 per-landmark override hook still draws into the main context with `drawImage`, so it is unaffected.
- `CLAUDE.md` Phase 1 Step 6 (which prescribes `shadowBlur`) should be updated.
