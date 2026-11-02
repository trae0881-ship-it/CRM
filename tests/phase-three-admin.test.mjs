import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/202611020010_platform_admin_audit.sql", import.meta.url), "utf8");
const corrections = await readFile(new URL("../supabase/migrations/202611020011_security_corrections.sql", import.meta.url), "utf8");

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
