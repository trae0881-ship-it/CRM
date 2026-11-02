# Growth Tools

Growth Tools are represented by a disabled-by-default control plane. The CRM does not copy third-party source into the browser and does not report a service as healthy merely because a URL or credential field exists.

## Service policy

Each tool requires an isolated deployment, authenticated backend adapter, private network path, health check, timeout, retry limit, resource quota and audit record. Company access must be explicitly granted per tool.

## Tool status

- Open SEO: WAITING FOR DEPLOYMENT.
- Open SEO Crawler: WAITING FOR DEPLOYMENT; add SSRF, DNS rebinding, robots and concurrency controls.
- Google Maps Scraper Kit: WAITING FOR DEPLOYMENT; require legal review and manual lead approval.
- LeadPro: BLOCKED BY LICENSE; no deployment or redistribution.
- listmonk: WAITING FOR DEPLOYMENT; separate PostgreSQL/SMTP deployment and AGPL-3.0 compliance review.

See [LICENSES.md](./LICENSES.md) and [DEPLOYMENT.md](./DEPLOYMENT.md) for repository and deployment requirements.

Phase 9 result: no service was deployed or reported connected. The exact next action is to provision isolated staging services, configure backend-only credentials, run authenticated health checks, and record job evidence before enabling organization access.
