## ADDED Requirements

### Requirement: Pinned library versions
All TF.js and pose-detection scripts SHALL be loaded at exact, recorded versions.

#### Scenario: Upstream release
- **WHEN** a new version of a TF.js package is published
- **THEN** the app keeps loading the pinned version

### Requirement: Same-origin libraries and model
The TF.js scripts and the MoveNet model files SHALL be served from the app's own origin.

#### Scenario: Page load
- **WHEN** the app loads and the model initialises
- **THEN** no network request goes to a third-party CDN or model host

### Requirement: Non-blocking script loading
The library scripts SHALL NOT block the first render of the page.

#### Scenario: Slow connection
- **WHEN** the page is loaded on a slow network
- **THEN** the title and controls render before the libraries finish downloading
- **AND** the status shows the model is loading
