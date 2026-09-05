# System Design Space Community

Public labs, corrections and audits for [System Design Space](https://system-design.space/en/). Website sources are maintained separately. Owned files in this repository use MIT; third-party Docker images retain their own licenses.

[Русский](README.md) · [Corrections](https://github.com/polomodov/system-design-space-community/issues/new/choose) · [Releases](https://github.com/polomodov/system-design-space-community/releases)

## Download a lab

Choose the lab archive from the release pinned by the website, verify it against SHA256SUMS, extract it, and enter `labs/<lab-id>`. Each workspace includes both READMEs, starter, solution and scripts. Docker, Docker Compose and initial network access to download images are required. Learners do not need Node.js.

```sh
tar -xzf <lab-id>-<version>.tar.gz
cd labs/<lab-id>
./scripts/start.sh
./scripts/check.sh healthy
./scripts/inject-failure.sh
./scripts/check.sh failure
./scripts/apply-solution.sh
./scripts/check.sh solution
./scripts/reset.sh
```

Labs: `kafka-rebalance-backpressure`, `retry-storm-outbox`, `slo-burn-rate-incident`. The outbox password is teaching data, used only inside an isolated Compose network with no published ports.

## Contribute

Open PRs for labs here and keep both locales equivalent. For website corrections, open an Issue with the public URL, current behavior, suggestion and source. A GitHub account is required; only you submit the report. An editor verifies it, publishes the fix, and then closes the Issue.

## Checks and releases

Node 24: `npm ci`, `npm test`, `npm run check:labs:manifests`, `npm run check:labs`. Docker smoke runs serially and finishes each lab with a scoped reset. The manually dispatched Release workflow accepts vX.Y.Z, validates current main, tags it and publishes only after successful smoke. A release contains community-labs.json, SHA256SUMS and one archive per lab. The site adopts each version explicitly; new releases do not update it automatically.

## Public audit

`AUDIT_SITE_URL=https://system-design.space/ npm run audit:layout` and `npm run audit:links` inspect public pages; use a local preview URL for local QA. Auditors read data/site-audit.v1.json, wait for interactivity and compare publication identity before/after. Reports live in reports/. A changed publication yields incomplete. Weekly audits are not required site deployment gates.
