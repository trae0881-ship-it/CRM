import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadTypeScript(relativePath) {
  const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("exports", "module", output)(module.exports, module);
  return module.exports;
}

const access = await loadTypeScript("../src/lib/documentationAccess.ts");
const content = await loadTypeScript("../src/content/documentation.ts");
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const center = await readFile(new URL("../src/components/DocumentationCenter.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/components/documentation.css", import.meta.url), "utf8");

const membership = (role, is_active = true) => ({
  organization_id: "org-1", user_id: "user-1", role, is_active,
});

test("documentation routes enforce the verified active membership role matrix", () => {
  const roles = ["company_owner", "organization_admin", "manager", "agent", "auditor"];
  for (const role of roles) assert.equal(access.canAccessDocumentation("/docs", membership(role)), true, `${role} should read member docs`);
  assert.equal(access.canAccessDocumentation("/docs", membership("super_admin")), true);
  for (const role of ["company_owner", "organization_admin"]) {
    assert.equal(access.canAccessDocumentation("/admin/docs", membership(role)), true);
  }
  for (const role of ["manager", "agent", "auditor", "super_admin"]) {
    assert.equal(access.canAccessDocumentation("/admin/docs", membership(role)), false);
  }
  assert.equal(access.canAccessDocumentation("/saas/admin/docs", membership("super_admin")), true);
  for (const role of roles) assert.equal(access.canAccessDocumentation("/saas/admin/docs", membership(role)), false);
  assert.equal(access.canAccessDocumentation("/docs", membership("agent", false)), false);
  assert.equal(access.getDocumentationRedirectPath("/saas/admin/docs", membership("organization_admin")), "/admin/docs");
  assert.equal(access.getDocumentationRedirectPath("/admin/docs", membership("agent")), "/docs");
  assert.equal(access.getDocumentationRedirectPath("/docs", null), "/login");
  assert.match(app, /getCurrentMembership\(\)/);
  assert.match(app, /getDocumentationRedirectPath\(path, membership\)/);
  assert.doesNotMatch(app, /user_metadata\.role/);
});

test("all requested documentation chapters, WhatsApp help articles, and metadata exist", () => {
  assert.equal(content.documentation.salesperson.length, 18);
  assert.equal(content.documentation.saas_super_admin.length, 17);
  assert.equal(content.whatsappHelpArticleIds.length, 12);
  assert.equal(content.documentation.salesperson[0].title, "Getting Started");
  assert.equal(content.documentation.organization_admin.find((item) => item.id === "audit-logs").title, "Audit Logs");
  assert.equal(content.documentation.saas_super_admin.find((item) => item.id === "production-release").title, "Production Release Procedure");
  for (const centerArticles of Object.values(content.documentation)) {
    assert.deepEqual(centerArticles.map((item) => item.order), centerArticles.map((_, index) => index + 1));
    for (const item of centerArticles) {
      assert.ok(item.category && item.keywords.length && item.roles.length && item.updatedAt);
      assert.ok(item.steps.length > 0);
    }
  }
  for (const id of content.whatsappHelpArticleIds) {
    assert.ok(content.documentation.organization_admin.some((item) => item.id === id), `${id} must be included`);
  }
});

test("WhatsApp setup stays disconnected, organization-scoped, and secret-free", async () => {
  const controls = await readFile(new URL("../src/components/OrganizationAdminControls.tsx", import.meta.url), "utf8");
  const workspace = await readFile(new URL("../src/services/workspace.ts", import.meta.url), "utf8");
  assert.match(controls, /Not connected/);
  assert.match(controls, /Setup required/);
  assert.match(controls, /No WhatsApp Business provider/);
  assert.match(controls, /whatsapp-business-setup/);
  assert.doesNotMatch(controls, /localStorage|sessionStorage|access_token|webhook verification token|app secret/i);
  assert.doesNotMatch(workspace, /whatsapp.*(token|secret)|access_token/i);
  assert.match(app, /OrganizationAdminControls organizationId=\{membership\.organization_id\}/);
  assert.match(controls, /getOrganizationSettings\(organizationId\)/);
  assert.match(controls, /listOrganizationAudit\(organizationId\)/);
});

test("documentation navigation has mobile, search, illustration, print, and article controls", () => {
  assert.match(center, /Search documentation/);
  assert.match(center, /WorkflowIllustration/);
  assert.match(center, /Illustration — workflow, not an application screenshot/);
  assert.match(center, /window\.print\(\)/);
  assert.match(center, /Previous|PREVIOUS/);
  assert.match(center, /NEXT/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /documentation-sidebar\.open/);
  assert.match(css, /@media print/);
});

test("login uses the inspected Adometa reference brand tokens", async () => {
  const tokens = await readFile(new URL("../src/design-tokens.css", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
  for (const value of ["#0f172a", "#1e293b", "#334155", "#4f46e5", "#a5b4fc"]) assert.ok(tokens.includes(value));
  assert.match(styles, /auth-page\{background:var\(--adometa-auth-background\)\}/);
  assert.match(styles, /auth-page \.auth-card label input\{background:var\(--adometa-auth-input\)/);
  assert.match(styles, /auth-page \.button\.primary\{background:var\(--adometa-auth-primary\);border-radius:8px/);
});
