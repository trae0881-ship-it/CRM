import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath = new URL("../supabase/migrations/202611020006_lead_journey_sharing.sql", import.meta.url);

test("lead journey migration is additive and defines immutable timeline storage", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table if not exists public\.lead_journey_events/i);
  assert.match(sql, /revoke insert, update, delete on public\.lead_journey_events/i);
  assert.match(sql, /create policy lead_journey_read/i);
  assert.doesNotMatch(sql, /\bdrop table\b/i);
  assert.doesNotMatch(sql, /\btruncate\b/i);
});

test("lead sharing migration protects tenant scope and duplicate active shares", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create unique index if not exists lead_shares_active_unique/i);
  assert.match(sql, /recipient is not an active salesperson in this organization/i);
  assert.match(sql, /create or replace function public\.transfer_lead/i);
  assert.match(sql, /A transfer reason is required/i);
});
