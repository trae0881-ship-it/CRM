import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Super Admin migration is bound to the existing Auth user and is repeat-safe", async () => {
  const migration = await readFile(new URL("../supabase/migrations/20261116151122_assign_existing_super_admin.sql", import.meta.url), "utf8");

  assert.match(migration, /target_user constant uuid := '52cc151f-651e-4abd-87fa-bb1e28fb36eb'/);
  assert.match(migration, /target_email constant text := 'am123allindiafree@gmail\.com'/);
  assert.match(migration, /from auth\.users[\s\S]*where id = target_user/);
  assert.match(migration, /actual_email is distinct from lower\(target_email\)/);
  assert.match(migration, /insert into public\.organization_members[\s\S]*'super_admin', true[\s\S]*on conflict \(organization_id, user_id\) do update/);
  assert.doesNotMatch(migration, /insert\s+into\s+auth\.users/i);
  assert.match(migration, /'super_admin_assigned'/);
  assert.match(migration, /'organization_admins'/);
  assert.match(migration, /'super_admins'/);
  assert.match(migration, /if not public\.is_platform_admin\(\) then/);
  assert.match(migration, /Guarded rollback/);
});

test("active platform membership takes precedence when an existing user has another organization membership", async () => {
  const workspace = await readFile(new URL("../src/services/workspace.ts", import.meta.url), "utf8");
  assert.match(workspace, /const memberships = \(data \?\? \[\]\) as Membership\[\]/);
  assert.match(workspace, /memberships\.find\(\(membership\) => membership\.role === "super_admin"\)/);
  assert.match(workspace, /if \(platformMembership\) return platformMembership/);
});
