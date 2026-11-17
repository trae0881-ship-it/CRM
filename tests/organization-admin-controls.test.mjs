import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/components/OrganizationAdminControls.tsx", import.meta.url), "utf8");
const workspace = await readFile(new URL("../src/services/workspace.ts", import.meta.url), "utf8");
const roleRoutes = await readFile(new URL("../src/lib/roleRoutes.ts", import.meta.url), "utf8");

test("organization settings and activity are wired to RLS-protected tenant records", () => {
  assert.match(app, /OrganizationAdminControls organizationId=\{membership\.organization_id\}/);
  assert.match(roleRoutes, /path: "\/org\/settings", label: "Organization Settings", area: "organization", view: "Organization Settings", roles: ownersAndAdmins/);
  assert.match(app, /view === "Organization Settings" && membership/);
  assert.match(controls, /getOrganizationSettings\(organizationId\)/);
  assert.match(controls, /saveOrganizationSettings\(organizationId, settings\)/);
  assert.match(controls, /listOrganizationAudit\(organizationId\)/);
  assert.match(workspace, /\.from\("organization_settings"\)\.upsert/);
  assert.match(workspace, /\.from\("audit_logs"\)/);
  assert.match(workspace, /\.eq\("organization_id", organizationId\)/);
});

test("organization settings validate input before issuing a tenant-scoped upsert", () => {
  const saveFunction = workspace.slice(workspace.indexOf("export async function saveOrganizationSettings"), workspace.indexOf("export async function listOrganizationAudit"));
  assert.match(saveFunction, /valid contact email address/);
  assert.match(saveFunction, /valid IANA time zone/);
  assert.match(saveFunction, /organization_id: organizationId/);
  assert.match(saveFunction, /onConflict: "organization_id"/);
});
