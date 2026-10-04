# Change: Set up HTTPS dev serving and housekeeping

## Why
Phones only grant camera access on secure origins, and `make run` serves plain HTTP (`Makefile:7-9`), so the app
can't be tested on a real device (H1). A few small repo issues are bundled here (H2, H3).

## What Changes
- Add a `make run-https` target that serves the project over HTTPS on the LAN using a locally trusted certificate
  (e.g. generated with `mkcert`), keeping `make run` for desktop.
- Rename `Claude.md` → `CLAUDE.md` with `git mv`.
- Remove the stale comment in `index.html:31-32` about adding `music.mp3`.

## Impact
- Affected specs: `dev-environment`
- Affected code: `Makefile`, `index.html`, `Claude.md`
- No app behaviour changes.
