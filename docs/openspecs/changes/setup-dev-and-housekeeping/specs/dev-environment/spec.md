## ADDED Requirements

### Requirement: HTTPS development server
The project SHALL provide a make target that serves the app over HTTPS on the local network so it can be opened
on iOS and Android devices with camera access.

#### Scenario: Phone on the same network
- **WHEN** the developer runs `make run-https` and opens the printed `https://` URL on a phone that trusts the local CA
- **THEN** the page loads without a certificate error
- **AND** tapping "Start Camera" shows the browser's camera permission prompt

#### Scenario: Desktop workflow unchanged
- **WHEN** the developer runs `make run`
- **THEN** the app is served on `http://localhost:8000` as before

### Requirement: Project instructions file name
The project instructions file SHALL be named `CLAUDE.md`.

#### Scenario: Case-sensitive checkout
- **WHEN** the repository is cloned on a case-sensitive file system
- **THEN** `CLAUDE.md` exists at the repository root
