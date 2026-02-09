# games

This repository contains game development projects.

## Projects

- `sandbox-survival/`: web-first 3D sandbox survival prototype (active)

Run local development from the module directory:

```bash
cd sandbox-survival
npm install
npm run dev
```

## Unified Test Environment

This repository uses a Docker-based test environment to keep validation consistent across machines.

- Base image: `mcr.microsoft.com/playwright:v1.58.2-jammy`
- Browser for 3D E2E: Playwright Firefox + `xvfb-run`
- Entry command: `scripts/test-in-container.sh`

Run the containerized test flow:

```bash
bash scripts/test-in-container.sh --app-dir sandbox-survival
```

The script builds `infra/docker/Dockerfile.test`, runs tests inside a container, and copies generated reports to `artifacts/container/`.
