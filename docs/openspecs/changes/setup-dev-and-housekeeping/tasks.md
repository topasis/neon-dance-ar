# Tasks

- [ ] 1.1 Add `run-https` target to `Makefile` that serves the repo root over HTTPS on `0.0.0.0:8443` using cert/key
      files from a git-ignored folder (e.g. `.certs/`).
- [ ] 1.2 Add a `certs` target (or README note) explaining how to create them with `mkcert <LAN-IP> localhost` and
      how to trust the mkcert root CA on iOS/Android.
- [ ] 1.3 Add `.certs/` to `.gitignore`.
- [ ] 1.4 `git mv Claude.md CLAUDE.md`.
- [ ] 1.5 Delete the stale comment at `index.html:31-32`.
- [ ] 1.6 Verify: open `https://<LAN-IP>:8443` on a phone, tap "Start Camera", the permission prompt appears.
