import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const profileMenu = await readFile(new URL("../src/components/ProfileMenu.tsx", import.meta.url), "utf8");
const authService = await readFile(new URL("../src/services/auth.ts", import.meta.url), "utf8");
const profileMigration = await readFile(new URL("../supabase/migrations/202611020022_self_profile_update.sql", import.meta.url), "utf8");
const suspensionMigration = await readFile(new URL("../supabase/migrations/202611020023_block_suspended_organization_access.sql", import.meta.url), "utf8");

test("logout clears workspace state and routes signed-out users to the correct login", () => {
  assert.match(app, /await signOut\(\)/);
  assert.match(app, /clearWorkspaceState\(\)/);
  assert.match(app, /previousUserId && !nextUserId/);
  assert.match(app, /reason=session-expired/);
  assert.match(app, /membershipLoaded\) return/);
});

test("desktop profile and mobile navigation expose sign out for every role", () => {
  assert.match(app, /<ProfileMenu session=\{session\} membership=\{membership\}/);
  assert.match(app, /className="nav-item mobile-signout"/);
  for (const role of ["super_admin", "company_owner", "organization_admin", "manager", "agent", "auditor"]) {
    assert.match(profileMenu, new RegExp(`${role}:`));
  }
  assert.match(profileMenu, /Sign out/);
});

test("profile updates validate and only write self-service profile metadata", () => {
  const updateMethod = authService.slice(authService.indexOf("export async function updateUserProfile"), authService.indexOf("export async function requestPasswordReset"));
  assert.match(updateMethod, /target_full_name: fullName/);
  assert.match(updateMethod, /target_avatar_url: avatarUrl/);
  assert.match(updateMethod, /parsedUrl\.protocol !== "https:"/);
  assert.doesNotMatch(updateMethod, /\brole\s*:/);
  assert.match(profileMenu, /Roles and permissions are managed by your organization/);
  assert.match(updateMethod, /rpc\("update_own_profile"/);
  assert.match(profileMigration, /auth\.uid\(\)/);
  assert.match(profileMigration, /revoke all on function public\.update_own_profile/);
  assert.match(profileMigration, /grant execute on function public\.update_own_profile\(text, text\) to authenticated/);
  assert.doesNotMatch(profileMigration, /target_role|role\s*=/i);
});

test("suspended organizations fail the shared backend membership check", () => {
  assert.match(suspensionMigration, /join public\.organizations o on o\.id = m\.organization_id/);
  assert.match(suspensionMigration, /and o\.is_active/);
  assert.match(suspensionMigration, /create or replace function public\.has_org_role/);
  assert.match(suspensionMigration, /create or replace function public\.is_team_manager/);
  assert.match(suspensionMigration, /create or replace function public\.is_team_member/);
  assert.match(suspensionMigration, /t\.organization_id = tm\.organization_id/);
  assert.match(suspensionMigration, /grant execute on function public\.is_org_member\(uuid\) to authenticated/);
});
