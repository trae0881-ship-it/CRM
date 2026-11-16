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
  assert.match(app, /new Set\(\["\/saas\/admin\/domains", "\/saas\/admin\/domains\/links"\]\)/);
  assert.match(app, /membership\.role !== "super_admin" \|\| !membership\.is_active/);
  assert.match(app, /<DomainManagementView/);
  assert.match(app, /<DomainLinksView/);
  assert.match(app, /applyRouteMetadata\(window\.location\.pathname, Boolean\(session\)\)[\s\S]*?\}, \[session\]\)/);
  const api = await read("mysql/services/server.mjs");
  assert.match(api, /verifyPlatformSuperAdmin\(token\)/);
  assert.match(api, /const access = await platformActor\(request\)/);
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
