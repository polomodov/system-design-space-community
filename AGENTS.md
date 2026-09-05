# Community contributor contract

This repository owns the runnable Docker labs and public-site auditors for System Design Space. Keep lab IDs/check IDs stable, preserve equivalent RU/EN instructions, and run `npm test`, `npm run check:labs:manifests` and serial `npm run check:labs` for lab changes. Releases run all checks on the tagged commit and package only tracked lab files plus LICENSE. No private website credentials or source checkout belongs in these workflows.

Before reading files, run `sonar analyze secrets <path>` when Sonar is installed. The maintainer approved exactly two teaching-data findings on 2026-09-05: in `labs/retry-storm-outbox/compose.yaml`, `services.db.environment.POSTGRES_PASSWORD` and `services.runner.environment.PGPASSWORD` intentionally equal `lab-local-only`. Only those exact `secrets:S2068` findings may be treated as false positives. Any other finding blocks reading until resolved. Do not ignore the whole file or directory; NOSONAR does not suppress these CLI findings.

Audit results use public page paths only. A changed publication identity makes the whole run incomplete. Lab PR jobs use read-only permissions. Publish releases only from reviewed main history; publication jobs must never execute unreviewed fork code with write permissions.
