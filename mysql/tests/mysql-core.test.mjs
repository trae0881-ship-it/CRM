import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sourceRecordKey, stripSecrets, ENTITY_TABLES, EXCLUDED_TABLES } from "../schemas/entities.mjs";
import { getMySqlConfig } from "../config/env.mjs";
import { migration } from "../migrations/001_sync_schema.mjs";
import { safeErrorCode } from "../sync/outbox.mjs";

test("MySQL configuration fails closed and never supplies browser credentials", () => {
  const saved = Object.fromEntries(["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_PORT", "MYSQL_SSL"].map((key) => [key, process.env[key]]));
  try {
    for (const key of Object.keys(saved)) delete process.env[key];
    assert.throws(() => getMySqlConfig(), /MYSQL_HOST/);
    Object.assign(process.env, { MYSQL_HOST: "db.internal", MYSQL_DATABASE: "adometa", MYSQL_USER: "replica", MYSQL_PASSWORD: "test-secret", MYSQL_PORT: "3306", MYSQL_SSL: "true" });
    const config = getMySqlConfig();
    assert.equal(config.host, "db.internal");
    assert.equal(config.ssl.rejectUnauthorized, true);
    assert.equal(config.password, "test-secret");
    assert.throws(() => {
      process.env.MYSQL_PORT = "not-a-port";
      getMySqlConfig();
    }, /MYSQL_PORT/);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("replication allowlist uses canonical keys and strips credentials recursively", () => {
  assert.ok(ENTITY_TABLES.includes("leads"));
  assert.ok(ENTITY_TABLES.includes("organization_members"));
  assert.ok(ENTITY_TABLES.includes("pipeline_stages"));
  assert.ok(ENTITY_TABLES.includes("payment_transactions"));
  assert.ok(ENTITY_TABLES.includes("contact_submissions"));
  assert.ok(EXCLUDED_TABLES.includes("meta_integration_secrets"));
  assert.ok(EXCLUDED_TABLES.includes("google_oauth_states"));
  assert.equal(sourceRecordKey("leads", { id: "lead-uuid" }), "lead-uuid");
  assert.equal(sourceRecordKey("organization_members", { organization_id: "org", user_id: "user" }), "b3Jn.dXNlcg");
  assert.deepEqual(stripSecrets({ id: "safe", access_token: "do-not-copy", nested: { clientSecret: "do-not-copy", value: 1 } }), {
    id: "safe", nested: { value: 1 },
  });
  assert.throws(() => sourceRecordKey("organization_members", { organization_id: "org" }), /Missing primary key/);
});

test("MySQL schema creates an isolated, idempotent snapshot table for each approved entity", () => {
  for (const entity of ENTITY_TABLES) {
    assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS \`crm_mirror_${entity}\``), `${entity} mirror table must exist`);
  }
  assert.match(migration, /source_sequence BIGINT UNSIGNED/);
  assert.match(migration, /payload JSON NOT NULL/);
  assert.match(migration, /PRIMARY KEY \(source_record_key\)/);
  assert.match(migration, /mysql_sync_events/);
  assert.match(migration, /mysql_sync_progress/);
});

test("existing MySQL installations receive a versioned contact mirror table migration", async () => {
  const sql = await readFile(new URL("../migrations/002_contact_submissions.mjs", import.meta.url), "utf8");
  const runner = await readFile(new URL("../scripts/migrate.mjs", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS crm_mirror_contact_submissions/);
  assert.match(sql, /payload JSON NOT NULL/);
  assert.match(runner, /002_contact_submissions/);
});

test("Supabase outbox grants only service role and supports replay with ordered idempotent events", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/202611020025_mysql_sync_outbox.sql", import.meta.url), "utf8");
  assert.match(sql, /after insert or update or delete/);
  assert.match(sql, /event_sequence/);
  assert.match(sql, /for update skip locked/);
  assert.match(sql, /earlier\.event_sequence < current_event\.event_sequence/);
  assert.match(sql, /attempt_count >= 12/);
  assert.match(sql, /replay_mysql_sync_failures/);
  assert.match(sql, /revoke all on function public\.claim_mysql_sync_outbox[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.claim_mysql_sync_outbox[\s\S]*to service_role/);
  assert.match(sql, /mysql_sync_strip_secrets/);
  assert.match(sql, /current_event\.status = 'failed' and current_event\.attempt_count < 12/);
  assert.match(sql, /lease_until < now\(\)/);
  assert.match(sql, /next_attempt_at = case[\s\S]*attempt_count >= 12[\s\S]*power\(2, least\(attempt_count, 11\)\)/);
});

test("public contact migration keeps submissions server-only and adds MySQL outbox synchronization", async () => {
  const sql = await readFile(new URL("../../supabase/migrations/202611020027_public_contact_submissions.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.contact_submissions/);
  assert.match(sql, /status text not null default 'new'/);
  assert.match(sql, /idempotency_key uuid not null unique/);
  assert.match(sql, /revoke all on public\.contact_submissions from public, anon, authenticated/);
  assert.match(sql, /grant all on public\.contact_submissions to service_role/);
  assert.match(sql, /after insert or update or delete on public\.contact_submissions/);
  assert.match(sql, /updated_at timestamptz not null default now\(\)/);
});

test("backfill resumes in ordered pages and reconciliation reports without mutating data", async () => {
  const backfill = await readFile(new URL("../scripts/backfill.mjs", import.meta.url), "utf8");
  const reconcile = await readFile(new URL("../sync/reconcile.mjs", import.meta.url), "utf8");

  assert.match(backfill, /\.range\(offset, offset \+ 249\)/);
  assert.match(backfill, /"contact_submissions"/);
  assert.match(backfill, /readBackfillProgress/);
  assert.match(backfill, /saveBackfillProgress/);
  assert.match(backfill, /withTransaction/);
  assert.match(reconcile, /missing \+= 1/);
  assert.match(reconcile, /mismatched \+= 1/);
  assert.match(reconcile, /contact_submissions/);
  assert.match(reconcile, /includeGlobalContacts/);
  assert.match(reconcile, /status = "mismatch"/);
  assert.doesNotMatch(reconcile, /\b(?:INSERT|UPDATE|DELETE)\s+INTO\b/i);
});

test("platform access is checked against an authenticated active database membership", async () => {
  const source = await readFile(new URL("../config/supabase.mjs", import.meta.url), "utf8");
  assert.match(source, /admin\.auth\.getUser\(token\)/);
  assert.match(source, /\.from\("organization_members"\)/);
  assert.match(source, /\.eq\("role", "super_admin"\)/);
  assert.match(source, /\.eq\("is_active", true\)/);
});

test("database error reporting exposes a safe code instead of an error message", () => {
  const code = safeErrorCode({ code: "ER_ACCESS_DENIED_ERROR", message: "mysql://user:password@secret-host" });
  assert.equal(code, "ER_ACCESS_DENIED_ERROR");
  assert.doesNotMatch(code, /password|secret-host/);
});
