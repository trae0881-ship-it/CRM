# DNS and Custom Domain Deployment Guide

This guide covers the code in `src/components/DomainManagementView.tsx`, `src/services/domains.ts`, `src/lib/appUrls.ts`, `mysql/services/domain-verification.mjs`, and migration 026. No real domain is currently verified.

## 1. Deploy prerequisites

- Apply the reviewed domain migration to the intended staging Supabase project only after verifying earlier history.
- Deploy the Node database API with server-only Supabase service-role access and set frontend `VITE_DATABASE_API_URL`.
- Confirm the frontend Supabase URL/key refer to the same intended project.
- Configure the selected hosting project to accept the custom domain and issue a certificate.

## 2. Add hostnames

Sign in as a verified Super Admin and open `/saas/admin/domains`. Add root and `www` hostnames as separate records if both are needed. The generated Adometa TXT challenge is for ownership validation; it is not a hosting A/AAAA/CNAME target.

Copy A, AAAA, CNAME, nameserver or other records only from the actual Hostinger, Vercel, Railway or DNS provider dashboard. This repository does not supply or guess provider targets. Add the exact `_adometa-verification.<hostname>` TXT record and challenge value shown in the UI.

## 3. Verify

The backend resolves public IPv4/IPv6 addresses, rejects non-public targets, checks the TXT ownership challenge and makes a TLS-validated HTTPS `HEAD` to the same pinned public address. Only the server's verification RPC can mark the record active, and primary selection requires active DNS and SSL states. A local/unit test is not a real domain verification.

Test each root and www hostname separately. Review the safe status/error code and verification time. An HTTP response status alone does not bypass certificate validation or prove every app route works.

## 4. Canonical and redirects

Select a verified active primary. The frontend URL helper uses the selected canonical hostname for supported generated links and runtime public metadata. Localhost keeps its local origin. Configure matching HTTPS and www/root redirects in the hosting provider: a JavaScript redirect cannot run until the page is already served, so it does not replace edge/host-level redirects.

Open the alternate host, follow the redirect, and confirm the canonical host does not loop. Test preserved path, query and fragment behavior.

## 5. Supabase Auth and provider callbacks

In Supabase Dashboard → Authentication → URL Configuration:

- Set Site URL to the exact canonical HTTPS origin.
- Add exact application confirmation, recovery and invitation callback destinations to allowed redirect URLs.
- Update OAuth provider callback URLs to the exact callback shown by Supabase.

Adometa cannot change Supabase or OAuth provider settings. Test signup confirmation, password recovery, invitation acceptance, login/logout and session expiry after the setting change. Google Sheets OAuth has its own function callback; register the exact deployed function URI with Google rather than substituting the CRM host.

## 6. Guides and SEO

The Vite build publishes the standalone guides under `/domain-guides/`; authenticated application documentation remains under `/docs`, `/admin/docs`, and `/saas/admin/docs`. The domain API produces `/seo/sitemap.xml` and `/seo/robots.txt`, but static hosting does not automatically map these to the CRM origin's `/sitemap.xml` and `/robots.txt`.

For static Hostinger or Vercel output, build after the canonical hostname is active, then run `npm run seo:publish -- --api-origin https://YOUR_DATABASE_API_ORIGIN --canonical-origin https://YOUR_VERIFIED_CRM_HOSTNAME`. This validates that sitemap URLs use the chosen canonical origin and reject private paths, then writes root `sitemap.xml` and updates root `robots.txt` inside `dist/`. Upload the complete resulting `dist/` folder. Use actual HTTPS origins, not the uppercase examples.

This is an explicit per-release publication step; it does not update DNS, hosting, or Supabase settings. Verify the root URLs over HTTPS, response status/content type, canonical host and public-only route list before submitting to search engines. The unbuilt static `public/robots.txt` intentionally does not advertise an unverified sitemap.

## 7. Rollback

Keep the previous working hostname and callbacks until cutover is validated. On failure, select the previous verified primary, revert host-level redirect rules and restore the previous Supabase Site URL/allowed redirects. Do not remove old DNS until the user flows and all public pages work. Use the full [rollback guide](./ROLLBACK_GUIDE.md).
