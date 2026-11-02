import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202611020010_platform_admin_audit.sql", import.meta.url), "utf8");
const corrections = await readFile(new URL("../supabase/migrations/202611020011_security_corrections.sql", import.meta.url), "utf8");
const bootstrap = await readFile(new URL("../supabase/migrations/202611020017_super_admin_bootstrap.sql", import.meta.url), "utf8");
const bootstrapFunction = await readFile(new URL("../supabase/functions/bootstrap-super-admin/index.ts", import.meta.url), "utf8");
const organizationHardening = await readFile(new URL("../supabase/migrations/202611020018_organization_admin_hardening.sql", import.meta.url), "utf8");

test("platform migration limits support access and audits platform actions", () => {
  assert.match(migration, /platform_support_grants/);
  assert.match(migration, /is_platform_admin/);
  assert.match(migration, /audit_platform_action/);
  assert.match(migration, /revoke insert, update, delete on public\.platform_support_grants/);
});

test("platform migration adds immutable journey triggers for CRM operations", () => {
  for (const trigger of ["leads_assignment_event", "calls_timeline_event", "followups_timeline_event", "visits_timeline_event", "bookings_timeline_event"]) {
    assert.match(migration, new RegExp(trigger));
  }
  assert.match(migration, /write_lead_timeline_event/);
  assert.match(migration, /mark_all_notifications_read/);
  assert.match(migration, /notify_crm_event/);
  assert.match(migration, /notifications_dedupe_idx/);
});

test("platform migration never grants platform lead access", () => {
  assert.doesNotMatch(migration, /grant .* on public\.leads .*super_admin/);
  assert.match(migration, /platform_support_grants/);
});

test("security corrections bind calls, visits and bookings to authorized leads", () => {
  assert.match(corrections, /calls_authorized_insert/);
  assert.match(corrections, /l\.organization_id = calls\.organization_id/);
  assert.match(corrections, /drop policy if exists visits_authorized_all/);
  assert.match(corrections, /drop policy if exists bookings_authorized_all/);
  assert.match(corrections, /record_booking_payment/);
});

test("Super Admin bootstrap is one-time, atomic and server-only", () => {
  assert.match(bootstrap, /pg_advisory_xact_lock/);
  assert.match(bootstrap, /role = 'super_admin' and is_active/);
  assert.match(bootstrap, /super_admin_bootstrapped/);
  assert.match(bootstrap, /grant execute .* to service_role/);
  assert.match(bootstrapFunction, /SUPER_ADMIN_BOOTSTRAP_SECRET/);
  assert.match(bootstrapFunction, /x-bootstrap-secret/);
  assert.match(bootstrapFunction, /auth\.getUser/);
  assert.match(bootstrapFunction, /constantTimeEqual/);
});

test("organization administration is RPC-authorized and protects tenant privileges", () => {
  assert.match(organizationHardening, /update_organization_member/);
  assert.match(organizationHardening, /target_role = 'super_admin'/);
  assert.match(organizationHardening, /target_user = auth\.uid\(\)/);
  assert.match(organizationHardening, /last active Company Owner/);
  assert.match(organizationHardening, /Subscription user limit reached/);
  assert.match(organizationHardening, /organization_membership_changed/);
  assert.match(organizationHardening, /validate_team_manager/);
  assert.match(organizationHardening, /assign_team_manager/);
  assert.match(organizationHardening, /same organization/);
});
