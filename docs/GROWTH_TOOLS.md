# Growth Tools

The Super Admin Growth Tools and license register display the verified upstream snapshot and current operational status. These repositories are not integrated into the CRM frontend. No service is deployed, no external credentials are configured, and no service may be shown as healthy based on a static configuration.

## Pinned upstream register

Verification date: **2026-11-16**. See [LICENSES.md](./LICENSES.md) for notices, license decisions and source links.

| Project | Version | Commit | License | Current status |
|---|---|---|---|---|
| Open SEO | `v0.3.0` (2026-10-11) | `cc7b9e6f85c613c146d45d63486d246d8497e620` | MIT | **BLOCKED**: DNS-rebinding SSRF remediation patch prepared and tested locally; not upstream or deployed |
| Open SEO Crawler | `mcp-v1.0.0` (2026-10-16) | `654350c9ded45b7cc53df9150bfdb092b169b42d` | MIT | **BLOCKED**: redirect SSRF patch prepared and local tests pass; not upstream or deployed |
| Google Maps Scraper Kit | `v2.3.2` (2026-11-10) | `e370d0cb2a255fee3cd894e4ef1ba9aa170191e1` | MIT | **BLOCKED** until the full resolved dependency audit is completed; not deployed |
| LeadPro | No release/tag; inspected snapshot only | `ef98d85e4e94f9d80578cba142ce1dcda6ea3133` | No established license grant | **BLOCKED** pending written permission and dependency review |
| listmonk | `v6.2.0` (2026-06-26) | `ef0a75872463f10a4848af6c547d1c057405453a` | AGPL-3.0 | **BLOCKED** pending advisory and build/test review; not deployed |

`SECURITY REVIEW COMPLETE`, `DEPLOYED`, and `HEALTHY` are reserved for verifiable completed checks. The CRM reports `NOT DEPLOYED` for all services and `NOT DEPLOYED` health for all services. LeadPro is blocked by its license decision. Open SEO and Open SEO Crawler have confirmed SSRF findings in the pinned code; local patches and their validation results are recorded in [SECURITY_REMEDIATION_PATCHES.md](./SECURITY_REMEDIATION_PATCHES.md), but neither patch is upstream or deployed. The other reviews were limited and remain blocked from deployment because dependency/build checks are incomplete.

## Service policy

Before any integration is enabled, require:

- A completed source/dependency review and recorded advisories, findings, and remediation.
- An isolated container or service pinned to the exact full commit, private network ingress, non-root runtime where supported, read-only filesystem where supported, resource limits, health checks, and restart policy.
- Separate service credentials and data stores, server-side secret storage, encrypted backups, documented retention, and a tested restore procedure.
- An authenticated backend adapter, strict authorization, timeouts, bounded retries, quotas, job audit history, and explicit organization-level access grants.
- A review of data processing, retention, lawful basis, service terms, robots.txt, rate limiting, and deletion/suppression handling.

## Project-specific constraints

- **Open SEO:** keep any fetch/scrape behavior behind a private adapter; validate every target and redirect and block private, loopback, link-local, and cloud metadata destinations.
- **Open SEO:** the pinned implementation has a DNS-rebinding window between hostname validation and the independent fetch. A local patch binds each connection to the validated IP; the pinned upstream code remains vulnerable until the patch is reviewed and applied.
- **Open SEO Crawler:** the pinned unauthenticated `/fetch-robots-txt` route followed redirects without private-address checks and the app listened on all interfaces. A local patch validates each redirect, pins and peer-checks connections, and binds to loopback; the pinned upstream code remains vulnerable until the patch is reviewed and applied. Also constrain crawl depth, concurrency, response size, file types, and per-domain rate before deployment.
- **Google Maps Scraper Kit:** do not expose it as a customer-facing bulk-scraping feature. Require legal and terms review, a documented lawful basis, data minimization, and human review before CRM import.
- **LeadPro:** do not deploy, redistribute, or integrate until the copyright holder grants explicit written permission covering the intended commercial use.
- **listmonk:** operate separately from Adometa and complete [LISTMONK_AGPL_COMPLIANCE.md](./LISTMONK_AGPL_COMPLIANCE.md) before deployment, especially if modified.

## Verification and release policy

For each project, record the upstream release/tag, full commit, release date, dependency lockfiles and audit output, source review, configuration diff, image digest (when built), deployment environment, health-check evidence, backup identifier, and verification date. Repeat review on every version change. No project is enabled from a branch reference or an unverified image.
