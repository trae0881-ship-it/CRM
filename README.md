# Adometa CRM

Adometa is a responsive CRM foundation for lead management, sales pipeline visibility, campaigns, and follow-up work queues.

## Current phase

Phase 4 includes tenant-aware administration, immutable lead operations, secure exports, and provider-neutral integration boundaries. The experimental YouPI-PG adapter adds server-side checkout creation, signed webhook verification, immutable payment ledger records, and explicit UPI reconciliation gating. It is not represented as production-ready without real merchant credentials, verified webhook delivery, and bank-statement reconciliation.
Phase 6 adds tenant-scoped assignment rules, explainable lead scoring, configurable pipeline/workflow schemas, idempotent automation event claims, and an organization Automation control center. Workers and live provider integrations remain subject to staging deployment and credentials.

## Run locally

```bash
npm install
npm run dev
```

Validate the production build with `npm run build` on a machine with Node.js/npm installed.

## Required local runtime

Install the current Node.js LTS for Windows from [nodejs.org](https://nodejs.org/), then open a new PowerShell window and verify:

```powershell
node --version
npm --version
```

From the project root, run:

```powershell
npm install
npm run lint
npm test
npm run build
```

The project has been validated with Node.js/npm in the development workspace. Supabase CLI authentication and live database verification remain environment-specific and must be performed against the intended project.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Database plan](./docs/DATABASE.md)
- [Security plan](./docs/SECURITY.md)
- [Integration setup](./docs/INTEGRATIONS.md)
- [YouPI-PG merchant guide](./docs/YOUPI-PG.md)
- [Open-source license register](./docs/LICENSES.md)
- [Deployment requirements](./docs/DEPLOYMENT.md)
- [Testing plan](./docs/TESTING.md)

Never commit `.env` files or Supabase service-role keys. Use `.env.example` as the placeholder template.
