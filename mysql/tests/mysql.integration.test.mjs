import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { getPool, closeMySqlPool, checkMySqlConnection } from "../config/mysql.mjs";
import { applyOutboxEvent } from "../repositories/records.mjs";

const enabled = Boolean(
  process.env.MYSQL_HOST
  && process.env.MYSQL_DATABASE
  && process.env.MYSQL_TEST_DATABASE
  && process.env.MYSQL_DATABASE === process.env.MYSQL_TEST_DATABASE
  && process.env.MYSQL_USER
  && process.env.MYSQL_PASSWORD,
);

test("live MySQL migration, health, idempotent upsert, update, delete tombstone, and tenant scoping", {
  skip: enabled ? false : "BLOCKED: disposable MYSQL_TEST_DATABASE must exactly match MYSQL_DATABASE and credentials must be provided",
}, async () => {
  const firstId = randomUUID();
  const secondId = randomUUID();
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const eventIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const sequenceBase = Date.now() * 1000;
  const pool = getPool();
  try {
    const health = await checkMySqlConnection();
    assert.equal(health.connected, true);
    const [migrationRows] = await pool.execute("SELECT version FROM mysql_schema_migrations WHERE version = ?", ["001_sync_schema"]);
    assert.equal(migrationRows.length, 1, "run npm run mysql:migrate before integration tests");

    const event = (id, orgId, sequence, operation, eventId, name) => ({
      event_id: eventId,
      event_sequence: sequence,
      entity_type: "organizations",
      operation,
      source_record_key: id,
      organization_id: orgId,
      row_data: { id, name, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      created_at: new Date().toISOString(),
    });

    await applyOutboxEvent(event(firstId, organizationId, sequenceBase, "INSERT", eventIds[0], "Integration test original"));
    await applyOutboxEvent(event(firstId, organizationId, sequenceBase + 1, "UPDATE", eventIds[1], "Integration test updated"));
    await applyOutboxEvent(event(firstId, organizationId, sequenceBase + 1, "UPDATE", eventIds[1], "Integration test duplicate"));
    await applyOutboxEvent(event(secondId, otherOrganizationId, sequenceBase + 2, "INSERT", eventIds[2], "Second tenant"));
    await applyOutboxEvent(event(firstId, organizationId, sequenceBase + 3, "DELETE", eventIds[3], "Integration test deleted"));

    const [rows] = await pool.execute(
      "SELECT source_record_key, organization_id, source_sequence, deleted_at, payload FROM crm_mirror_organizations WHERE source_record_key IN (?, ?) ORDER BY source_record_key",
      [firstId, secondId],
    );
    assert.equal(rows.length, 2);
    const deleted = rows.find((row) => row.source_record_key === firstId);
    assert.equal(deleted.organization_id, organizationId);
    assert.equal(Number(deleted.source_sequence), sequenceBase + 3);
    assert.ok(deleted.deleted_at);
    const deletedPayload = typeof deleted.payload === "string" ? JSON.parse(deleted.payload) : deleted.payload;
    assert.equal(deletedPayload.name, "Integration test deleted");

    const [scoped] = await pool.execute("SELECT source_record_key FROM crm_mirror_organizations WHERE organization_id = ?", [organizationId]);
    assert.deepEqual(scoped.map((row) => row.source_record_key), [firstId]);
  } finally {
    await pool.execute("DELETE FROM mysql_sync_events WHERE event_id IN (?, ?, ?, ?)", eventIds).catch(() => undefined);
    await pool.execute("DELETE FROM crm_mirror_organizations WHERE source_record_key IN (?, ?)", [firstId, secondId]).catch(() => undefined);
    await closeMySqlPool();
  }
});
