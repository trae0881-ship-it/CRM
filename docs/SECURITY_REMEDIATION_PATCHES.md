# Growth Tool SSRF Remediation Patches

These are local remediation patches against the exact upstream snapshots in [GROWTH_TOOLS.md](./GROWTH_TOOLS.md). They are not upstream commits, releases, or deployments. Apply and review them in separate source checkouts at the stated pinned revisions; preserve the projects' upstream license notices.

| Project | Base revision | Patch | Verification |
|---|---|---|---|
| Open SEO | `v0.3.0`, `cc7b9e6f85c613c146d45d63486d246d8497e620` | [open-seo-ssrf-remediation.patch](./security-patches/open-seo-ssrf-remediation.patch) | 229 tests passed; production build passed (including TypeScript); `pnpm audit --prod` reported no known vulnerabilities |
| Open SEO Crawler | `mcp-v1.0.0`, `654350c9ded45b7cc53df9150bfdb092b169b42d` | [open-seo-crawler-ssrf-remediation.patch](./security-patches/open-seo-crawler-ssrf-remediation.patch) | Python syntax check passed; `pytest tests` passed (6 tests); executable E2E harness passed 26/26 checks |

Apply from the corresponding upstream source checkout, after verifying its `HEAD` matches the base revision:

```sh
git apply --check /path/to/adometa/docs/security-patches/open-seo-ssrf-remediation.patch
git apply /path/to/adometa/docs/security-patches/open-seo-ssrf-remediation.patch
```

Use the crawler patch path for the crawler checkout. Its patch also adds focused SSRF regression tests. Open SEO's patch pins Next.js `16.4.1`, Undici `7.30.1`, and Nodemailer `10.1.4` and updates the pnpm lockfile.

The patches were tested in temporary local clones only. The crawler E2E harness now uses a deterministic test-only response limited to its exact loopback fixture URL; production destination checks remain enabled and the SSRF tests cover private-target rejection. The patches have not been committed to either upstream repository, independently reviewed, deployed, or health-checked. Keep both services blocked until the changes are reviewed, applied to a maintained source revision, and pass the full required build/test and isolated deployment review. The repository-root `test_data_correctness.py` browser test was not run: it requires Playwright, an installed browser, a running crawler, and live crawl targets.
