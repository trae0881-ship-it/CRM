import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { isPublicIp, normalizeHostname } from "../mysql/services/domain-verification.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("domain verification accepts public hostnames and rejects local or malformed targets", () => {
  assert.equal(normalizeHostname("CRM.Example.com."), "crm.example.com");
  assert.throws(() => normalizeHostname("https://example.com/path"), /invalid_hostname/);
  assert.throws(() => normalizeHostname("127.0.0.1"), /invalid_hostname/);
  assert.equal(isPublicIp("8.8.8.8"), true);
  assert.equal(isPublicIp("10.0.0.1"), false);
  assert.equal(isPublicIp("::1"), false);
  assert.equal(isPublicIp("2001:4860:4860::8888"), true);
});

test("domain admin pages are rendered only for active Super Admin memberships", async () => {
  const app = await read("src/App.tsx");
  const roleRoutes = await read("src/lib/roleRoutes.ts");
  assert.match(roleRoutes, /path: "\/saas\/admin\/domains", label: "Custom Domains", area: "saas", view: "Platform", roles: platformRoles/);
  assert.match(roleRoutes, /path: "\/saas\/admin\/domains\/links", label: "Domain Links", area: "saas", view: "Platform", roles: platformRoles/);
  assert.match(app, /canAccessDashboardRoute\(routePath, membership\.role, membership\.is_active\)/);
  assert.match(app, /<DomainManagementView/);
  assert.match(app, /<DomainLinksView/);
  assert.match(app, /applyRouteMetadata\(routePath, Boolean\(session\)\)[\s\S]*?\}, \[routePath, session\]\)/);
  const api = await read("mysql/services/server.mjs");
  assert.match(api, /verifyPlatformSuperAdmin\(token\)/);
  assert.match(api, /const access = await platformActor\(request\)/);
  assert.match(app, /label: "Custom Domains"/);
  const view = await read("src/components/DomainManagementView.tsx");
  assert.match(view, /Add Domain/);
  assert.match(view, /Copy Host/);
  assert.match(view, /Copy TXT Value/);
  assert.match(view, /Verify Domain/);
  assert.match(view, /Pending domains/);
  assert.match(view, /Verified domains/);
  assert.match(view, /Suspend Domain/);
});

test("workspace domains require verified status, approved assignment, and fresh checks to reactivate", async () => {
  const migration = await read("supabase/migrations/20261116162000_platform_workspace_domains.sql");
  const server = await read("mysql/services/server.mjs");
  const urls = await read("src/lib/appUrls.ts");
  assert.match(migration, /organization_id uuid references public\.organizations\(id\)/);
  assert.match(migration, /verification_status <> 'active'[\s\S]*dns_status <> 'verified'[\s\S]*ssl_status <> 'verified'/);
  assert.match(migration, /workspace\.approval_status = 'approved'/);
  assert.match(migration, /is_suspended/);
  assert.match(server, /canVerifyDomain\(access\.actor\.userId, id\)/);
  assert.match(server, /verifyDomainRecords\(current\.hostname, current\.dns_challenge, expectedDomainTargets\(\)\)/);
  assert.match(server, /PLATFORM_DOMAIN_EXPECTED_TARGETS/);
  assert.match(server, /allowedAuthRedirectHost\(workspaceHostname\)/);
  const inviteFunction = await read("supabase/functions/invite-member/index.ts");
  assert.match(inviteFunction, /SUPABASE_AUTH_ALLOWED_REDIRECT_HOSTS/);
  assert.match(inviteFunction, /allowedRedirectHosts\.includes\(workspaceHostname\.toLowerCase\(\)\)/);
  const verifier = await read("mysql/services/domain-verification.mjs");
  assert.match(verifier, /expected_target_not_configured/);
  assert.match(verifier, /dns_target_mismatch/);
  assert.match(urls, /organizationHostnames\[organizationId\]/);
  assert.match(urls, /Object\.values\(config\.organizationHostnames\)\.includes/);
});

test("link registry only includes public indexable routes in the generated sitemap", async () => {
  const server = await read("mysql/services/server.mjs");
  assert.match(server, /route\.indexable === true && !route\.api && !route\.supabaseCallback/);
  assert.match(server, /No verified canonical domain is active/);
  const routes = JSON.parse(await read("shared/application-routes.json"));
  const protectedRoutes = routes.filter((route) => route.group === "SaaS Super Admin" || route.group === "CRM Dashboard");
  assert.ok(protectedRoutes.length > 0);
  assert.ok(protectedRoutes.every((route) => route.indexable === false));
  assert.ok(routes.some((route) => route.route === "/saas/admin/domains/links"));
});

test("all standalone domain guides are complete HTML and their relative page links resolve", async () => {
  const docsDirectory = fileURLToPath(new URL("../docs/", import.meta.url));
  const pages = [
    "index.html",
    "DOMAIN_SETUP.html",
    "CUSTOM_DOMAIN_CONNECTION.html",
    "AUTOMATIC_LINK_GENERATION.html",
    "DNS_CONFIGURATION.html",
    "DOMAIN_TROUBLESHOOTING.html",
    "SEO_LINK_CONFIGURATION.html",
  ];
  for (const page of pages) {
    const filename = resolve(docsDirectory, page);
    const html = await readFile(filename, "utf8");
    assert.match(html, /^<!DOCTYPE html>/i, page);
    assert.match(html, /<html\b[\s\S]*<head>[\s\S]*<\/head>[\s\S]*<body>[\s\S]*<\/body>[\s\S]*<\/html>/i, page);
    assert.match(html, /assets\/docs\.css/);
    assert.match(html, /assets\/docs\.js/);
    for (const [, href] of html.matchAll(/href="([^"#?]+\.html)(?:#[^"]*)?"/g)) {
      if (href.startsWith("/")) continue;
      await access(resolve(dirname(filename), href));
    }
  }
  const script = await read("docs/assets/docs.js");
  assert.match(script, /data-doc-search/);
  assert.match(script, /navigator\.clipboard\.writeText/);
  assert.match(script, /guide-mobile-toggle/);
});

test("domain guide deployment uses an isolated public path and old setup host is removed", async () => {
  const vite = await read("vite.config.ts");
  const registry = JSON.parse(await read("shared/application-routes.json"));
  const setup = await read("SUPADMIN_SETUP.md");
  assert.match(vite, /domain-guides/);
  assert.ok(registry.some((route) => route.route === "/domain-guides/index.html"));
  assert.doesNotMatch(setup, /purple-oryx-575835\.hostingersite\.com/);
});
