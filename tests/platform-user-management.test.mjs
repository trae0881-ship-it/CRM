import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parsePlatformUserFilters,
  validatePlatformUserEdit,
  validatePlatformUserInput,
} from "../mysql/services/platform-users.mjs";

const migration = await readFile(new URL("../supabase/migrations/20261116160000_platform_user_management.sql", import.meta.url), "utf8");
const server = await readFile(new URL("../mysql/services/server.mjs", import.meta.url), "utf8");
const routes = JSON.parse(await readFile(new URL("../shared/application-routes.json", import.meta.url), "utf8"));
const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

const validInput = {
  fullName: "Example User",
  email: "example@example.com",
  phone: "+1 555 555 0100",
  companyId: "52cc151f-651e-4abd-87fa-bb1e28fb36eb",
  role: "agent",
  isActive: true,
  sendInvitation: true,
};

test("platform user input normalizes valid details and rejects platform-role escalation", () => {
  const parsed = validatePlatformUserInput({ ...validInput, email: " EXAMPLE@EXAMPLE.COM " });
  assert.equal(parsed.value.email, "example@example.com");
  assert.equal(validatePlatformUserInput({ ...validInput, role: "super_admin" }).error, "Choose a supported organization role.");
  assert.equal(validatePlatformUserInput({ ...validInput, phone: "not a phone" }).error, "Enter a valid mobile number or leave it blank.");
});

test("platform user filters and edits reject malformed or privileged values", () => {
  assert.equal(parsePlatformUserFilters(new URLSearchParams("page=2&pageSize=50&status=invited")).value.page, 2);
  assert.ok(parsePlatformUserFilters(new URLSearchParams("page=0")).error);
  assert.ok(parsePlatformUserFilters(new URLSearchParams("role=unknown")).error);
  assert.ok(validatePlatformUserEdit({ fullName: "Admin", phone: "", role: "super_admin", isActive: true }).error);
});

test("platform user database functions are service-role-only and recheck active Super Admin membership", () => {
  for (const functionName of [
    "platform_list_users",
    "platform_find_auth_user_by_email",
    "platform_assign_user_membership",
    "platform_update_user_membership",
  ]) {
    const functionSql = migration.slice(migration.indexOf(`function public.${functionName}`));
    assert.match(functionSql, /auth\.role\(\) is distinct from 'service_role'/);
    assert.match(functionSql, /role = 'super_admin'/);
  }
  assert.match(migration, /revoke all on function public\.platform_list_users[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.platform_list_users[\s\S]*to service_role/);
  assert.match(migration, /last active Company Owner/);
  assert.match(migration, /Subscription user limit reached/);
});

test("platform user routes require verified platform access and are wired to the Super Admin page", () => {
  assert.match(server, /if \(access\.response\) return json\(response, access\.response\.status/);
  assert.match(server, /verifyPlatformSuperAdmin\(token\)/);
  assert.match(server, /url\.pathname === "\/platform\/users"/);
  assert.ok(routes.some((route) => route.route === "/saas/admin/users" && route.visibility === "Verified Super Admin"));
  assert.match(app, /canAccessDashboardRoute\(routePath, membership\.role, membership\.is_active\)/);
  assert.match(app, /isSaasAdminPath\(routePath\).*membership\.role !== "super_admin"/);
  assert.match(app, /view === "Users" && membership\?\.role === "super_admin"/);
});
