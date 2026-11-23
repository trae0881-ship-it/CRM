import { getPool, withTransaction } from "../config/mysql.mjs";
import { ENTITY_TABLES, sourceRecordKey, stripSecrets } from "../schemas/entities.mjs";

const tableSet = new Set(ENTITY_TABLES);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function assertEntity(entityType) {
  if (!tableSet.has(entityType)) throw new Error("Unsupported synchronized entity");
  return `\`crm_mirror_${entityType}\``;
}

export async function upsertSynchronizedRecord(connection, event) {
  const table = assertEntity(event.entity_type);
  const payload = stripSecrets(event.row_data ?? {});
  const recordKey = event.source_record_key || sourceRecordKey(event.entity_type, payload);
  const recordId = payload.id && uuidPattern.test(String(payload.id)) ? String(payload.id) : null;
  const rawOrganizationId = event.organization_id ?? (event.entity_type === "organizations" ? payload.id : payload.organization_id);
  const orgId = rawOrganizationId && uuidPattern.test(String(rawOrganizationId)) ? String(rawOrganizationId) : null;
  const sequence = Number(event.event_sequence ?? 0);
  const deletedAt = event.operation === "DELETE" ? dateValue(event.created_at) : dateValue(payload.deleted_at);
  const updatedAt = dateValue(payload.updated_at ?? payload.created_at);
  const createdAt = dateValue(payload.created_at);
  const eventId = event.event_id && uuidPattern.test(String(event.event_id)) ? String(event.event_id) : null;
  const sql = `
    INSERT INTO ${table} (
      source_record_key, source_record_id, organization_id, source_sequence,
      source_created_at, source_updated_at, deleted_at, source_event_id, payload, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), UTC_TIMESTAMP(3))
    ON DUPLICATE KEY UPDATE
      payload = IF(VALUES(source_sequence) >= source_sequence, VALUES(payload), payload),
      source_record_id = IF(VALUES(source_sequence) >= source_sequence, VALUES(source_record_id), source_record_id),
      organization_id = IF(VALUES(source_sequence) >= source_sequence, VALUES(organization_id), organization_id),
      source_created_at = IF(VALUES(source_sequence) >= source_sequence, VALUES(source_created_at), source_created_at),
      source_updated_at = IF(VALUES(source_sequence) >= source_sequence, VALUES(source_updated_at), source_updated_at),
      deleted_at = IF(VALUES(source_sequence) >= source_sequence, VALUES(deleted_at), deleted_at),
      source_event_id = IF(VALUES(source_sequence) >= source_sequence, VALUES(source_event_id), source_event_id),
      synced_at = IF(VALUES(source_sequence) >= source_sequence, UTC_TIMESTAMP(3), synced_at),
      source_sequence = GREATEST(source_sequence, VALUES(source_sequence))
  `;
  const [result] = await connection.execute(sql, [
    recordKey, recordId, orgId, sequence, createdAt, updatedAt, deletedAt, eventId, JSON.stringify(payload),
  ]);
  return { affectedRows: result.affectedRows, recordKey, recordId, organizationId: orgId };
}

export async function applyOutboxEvent(event) {
  return withTransaction(async (connection) => {
    const saved = await upsertSynchronizedRecord(connection, event);
    await connection.execute(
      `INSERT INTO mysql_sync_events
        (event_id, source_sequence, entity_type, source_record_key, organization_id, operation, status, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, 'completed', UTC_TIMESTAMP(3))
       ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
      [event.event_id, Number(event.event_sequence), event.entity_type, saved.recordKey, saved.organizationId, event.operation],
    );
    return saved;
  });
}

export async function countSynchronizedRecords() {
  const [rows] = await getPool().query(
    `SELECT entity_type, COUNT(*) AS records, SUM(deleted_at IS NOT NULL) AS tombstones
       FROM (
         ${ENTITY_TABLES.map((table) => `SELECT '${table}' AS entity_type, deleted_at FROM \`crm_mirror_${table}\``).join("\nUNION ALL\n")}
       ) AS synchronized_records
      GROUP BY entity_type ORDER BY entity_type`,
  );
  return rows.map((row) => ({ entityType: row.entity_type, records: Number(row.records), tombstones: Number(row.tombstones) }));
}

export async function getMySqlStorageUsage() {
  const [rows] = await getPool().query(
    `SELECT table_name, data_length, index_length
       FROM information_schema.tables
      WHERE table_schema = DATABASE()
      ORDER BY data_length + index_length DESC, table_name`,
  );
  const tables = rows.map((row) => ({
    tableName: String(row.table_name),
    tableBytes: Number(row.data_length ?? 0),
    indexBytes: Number(row.index_length ?? 0),
    totalBytes: Number(row.data_length ?? 0) + Number(row.index_length ?? 0),
  }));
  return {
    databaseBytes: tables.reduce((total, table) => total + table.totalBytes, 0),
    tables,
  };
}

export async function countEntityRecords(entityType, organizationId) {
  const table = assertEntity(entityType);
  const scopedOrganizationId = organizationId === "00000000-0000-0000-0000-000000000000" ? null : organizationId;
  const [rows] = scopedOrganizationId
    ? await getPool().execute(
      `SELECT COUNT(*) AS records, SUM(deleted_at IS NOT NULL) AS tombstones
         FROM ${table} WHERE organization_id = ?`,
      [scopedOrganizationId],
    )
    : await getPool().query(
      `SELECT COUNT(*) AS records, SUM(deleted_at IS NOT NULL) AS tombstones FROM ${table}`,
    );
  return { records: Number(rows[0]?.records ?? 0), tombstones: Number(rows[0]?.tombstones ?? 0) };
}

export async function countSynchronizedByOrganization() {
  const [rows] = await getPool().query(
    `SELECT organization_id, COUNT(*) AS records, SUM(deleted_at IS NOT NULL) AS tombstones,
            MAX(synced_at) AS last_synced_at
       FROM (
         ${ENTITY_TABLES.map((table) => `SELECT organization_id, deleted_at, synced_at FROM \`crm_mirror_${table}\` WHERE organization_id IS NOT NULL`).join("\nUNION ALL\n")}
       ) AS synchronized_records
      GROUP BY organization_id ORDER BY organization_id`,
  );
  return rows.map((row) => ({
    organizationId: row.organization_id,
    records: Number(row.records),
    tombstones: Number(row.tombstones),
    lastSyncedAt: row.last_synced_at,
  }));
}

export async function getMySqlSyncSummary() {
  const [rows] = await getPool().query(
    `SELECT COUNT(*) AS total_events,
            SUM(status = 'completed') AS completed_events,
            MAX(synced_at) AS last_successful_sync_at
       FROM mysql_sync_events`,
  );
  return {
    totalEvents: Number(rows[0]?.total_events ?? 0),
    completedEvents: Number(rows[0]?.completed_events ?? 0),
    lastSuccessfulSyncAt: rows[0]?.last_successful_sync_at ?? null,
  };
}

export async function saveBackfillProgress(connection, organizationId, entityType, offset, rowsSeen, status, errorCode = null) {
  await connection.execute(
    `INSERT INTO mysql_sync_progress
      (organization_id, entity_type, last_offset, rows_seen, status, last_error_code)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE last_offset = VALUES(last_offset), rows_seen = VALUES(rows_seen),
       status = VALUES(status), last_error_code = VALUES(last_error_code), updated_at = UTC_TIMESTAMP(3)`,
    [organizationId, entityType, offset, rowsSeen, status, errorCode],
  );
}

export async function readBackfillProgress(organizationId, entityType) {
  const [rows] = await getPool().execute(
    "SELECT last_offset, rows_seen, status FROM mysql_sync_progress WHERE organization_id = ? AND entity_type = ?",
    [organizationId, entityType],
  );
  return rows[0] ?? null;
}
