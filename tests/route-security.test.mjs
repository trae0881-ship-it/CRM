import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const routes = await readFile(new URL("../src/lib/roleRoutes.ts", import.meta.url), "utf8");

test("canonical SaaS and organization routes have explicit role guards", () => {
  assert.match(routes, /path: "\/saas\/admin\/dashboard"[\s\S]*?roles: platformRoles/);
  assert.match(routes, /path: "\/saas\/admin\/users"[\s\S]*?roles: platformRoles/);
  assert.match(routes, /path: "\/org\/dashboard"[\s\S]*?roles: organizationRoles/);
  assert.match(routes, /path: "\/org\/users"[\s\S]*?roles: ownersAndAdmins/);
  assert.match(app, /canAccessDashboardRoute\(routePath, membership\.role, membership\.is_active\)/);
  assert.match(app, /isSaasAdminPath\(routePath\).*membership\.role !== "super_admin"/);
  assert.match(app, /isOrganizationPath\(routePath\).*membership\.role === "super_admin"/);
});

test("login and legacy dashboard routes resolve to trusted membership dashboards", () => {
  assert.match(app, /listCurrentMemberships\(\)\.then/);
  assert.match(app, /navigateToPath\(getRoleDashboardPath\(membership\.role\), true\)/);
  assert.match(app, /navigateToPath\(getRoleDashboardPath\(option\.role\), true\)/);
  assert.match(app, /isLegacyDashboard/);
  assert.match(routes, /return role === "super_admin" \? "\/saas\/admin\/dashboard" : "\/org\/dashboard"/);
});

test("multiple memberships require selection and selection is checked against active memberships", () => {
  assert.match(app, /currentMemberships\.length > 1/);
  assert.match(app, /selectedOrganizationId/);
  assert.match(app, /currentMemberships\.find\(\(option\) => option\.organization_id === selectedOrganizationId\)/);
  assert.match(app, /<OrganizationSelectionView/);
});

test("protected route navigation follows browser history and unknown routes render Not Found", () => {
  assert.match(app, /window\.addEventListener\("popstate", handlePopState\)/);
  assert.match(app, /window\.history\.pushState/);
  assert.match(app, /return <NotFoundView \/>/);
});
