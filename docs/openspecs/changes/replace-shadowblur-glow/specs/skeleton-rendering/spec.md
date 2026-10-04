## ADDED Requirements

### Requirement: Glow without per-stroke shadow blur
The neon glow SHALL be produced by a downscaled offscreen layer composited additively, and the renderer SHALL NOT
use `shadowBlur`.

#### Scenario: Five people on screen
- **WHEN** five people are tracked
- **THEN** each skeleton shows a soft halo in its colour and a crisp core line
- **AND** the number of blur operations per frame doesn't depend on the number of people

#### Scenario: Overlapping skeletons
- **WHEN** two skeletons overlap
- **THEN** their colours add together where they overlap (additive blending)

### Requirement: Composite state reset
After drawing skeletons the renderer SHALL leave the context with `globalCompositeOperation = 'source-over'`.

#### Scenario: Next frame background
- **WHEN** the next frame draws the background
- **THEN** it isn't blended additively with the previous frame
