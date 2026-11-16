import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { closeMySqlPool, getPool, withTransaction } from "../config/mysql.mjs";
import { getSupabaseAdmin } from "../config/supabase.mjs";
import { ENTITY_TABLES, sourceRecordKey, stripSecrets } from "../schemas/entities.mjs";
import { countEntityRecords, readBackfillProgress, saveBackfillProgress, upsertSynchronizedRecord } from "../repositories/records.mjs";
import { safeErrorCode } from "../sync/outbox.mjs";

const GLOBAL_SCOPE = "00000000-0000-0000-0000-000000000000";
const GLOBAL_ENTITIES = new Set([
  "profiles", "meta_forms", "webhook_events", "subscription_plans",
  "payment_webhook_deliveries", "pipeline_stages", "contact_submissions",
]);
const COMPOSITE_ORDER = {
  organization_members: ["organization_id", "user_id"],
  team_members: ["organization_id", "team_id", "user_id"],
  lead_scoring_settings: ["organization_id"],
  organization_settings: ["organization_id"],
  growth_tool_access: ["organization_id", "tool_id"],
};

function ordered(query, entityType) {
  const keys = COMPOSITE_ORDER[entityType] ?? ["id"];
  return keys.reduce((current, key) => current.order(key, { ascending: true }), query);
}

function sourceQuery(client, entityType, scopeId) {
  let query = client.from(entityType).select("*", { count: "exact" });
  if (entityType === "organizations" && scopeId !== GLOBAL_SCOPE) return query.eq("id", scopeId);
  if (GLOBAL_ENTITIES.has(entityType)) return query;
  return query.eq("organization_id", scopeId);
}

async function getOrganizationIds(client, requestedOrganization) {
  if (requestedOrganization) return [requestedOrganization];
  const { data, error } = await client.from("organizations").select("id").order("id");
  if (error) throw new Error(`Could not list organizations (${error.code ?? "supabase_query_error"})`);
  return (data ?? []).map((row) => row.id);
}

export async function runInitialBackfill({ organizationId, entityFilter } = {}) {
  const client = getSupabaseAdmin();
  const pool = getPool();
  const { error: healthError } = await client.rpc("mysql_sync_health");
  if (healthError) throw new Error(`Supabase sync outbox is not available (${healthError.code ?? "migration_required"})`);
  const organizations = await getOrganizationIds(client, organizationId);
  const report = { status: "completed", organizations: organizations.length, tables: {}, failed: [] };
  const selectedEntities = entityFilter ? ENTITY_TABLES.filter((entity) => entity === entityFilter) : ENTITY_TABLES;
  if (entityFilter && !selectedEntities.length) throw new Error("Requested entity is not in the synchronization allowlist");

  for (const entityType of selectedEntities) {
    const scopes = GLOBAL_ENTITIES.has(entityType) ? [GLOBAL_SCOPE] : organizations;
    for (const scopeId of scopes) {
      let progress = await readBackfillProgress(scopeId, entityType);
      let offset = Number(progress?.last_offset ?? 0);
      let rowsSeen = Number(progress?.rows_seen ?? 0);
      let totalSourceRows = null;
      const progressConnection = await pool.getConnection();
      try { await saveBackfillProgress(progressConnection, scopeId, entityType, offset, rowsSeen, "running"); }
      finally { progressConnection.release(); }
      try {
        for (;;) {
          const query = ordered(sourceQuery(client, entityType, scopeId), entityType).range(offset, offset + 249);
          const { data, error, count } = await query;
          if (error) throw new Error(`Supabase query failed (${error.code ?? "supabase_query_error"})`);
          if (totalSourceRows === null && count !== null) totalSourceRows = count;
          if (!data?.length) {
            if (offset === 0 && count === 0) rowsSeen = 0;
            break;
          }
          await withTransaction(async (connection) => {
            for (const row of data) {
              const payload = stripSecrets(row);
              await upsertSynchronizedRecord(connection, {
                entity_type: entityType,
                operation: "BACKFILL",
                source_record_key: sourceRecordKey(entityType, payload),
                organization_id: payload.organization_id ?? (entityType === "organizations" ? payload.id : null),
                row_data: payload,
                event_sequence: 0,
                event_id: randomUUID(),
              });
            }
          });
          offset += data.length;
          rowsSeen += data.length;
          const connection = await pool.getConnection();
          try { await saveBackfillProgress(connection, scopeId, entityType, offset, rowsSeen, "running"); }
          finally { connection.release(); }
          if (count !== null && offset >= count) break;
        }
        const connection = await pool.getConnection();
        try { await saveBackfillProgress(connection, scopeId, entityType, offset, rowsSeen, "completed"); }
        finally { connection.release(); }
        const replica = await countEntityRecords(entityType, scopeId);
        const sourceRows = totalSourceRows ?? rowsSeen;
        report.tables[entityType] = {
          sourceRows: (report.tables[entityType]?.sourceRows ?? 0) + sourceRows,
          processedThisRun: (report.tables[entityType]?.processedThisRun ?? 0) + Math.max(0, offset - Number(progress?.last_offset ?? 0)),
          replicaRows: replica.records,
          tombstones: replica.tombstones,
        };
      } catch (error) {
        const code = safeErrorCode(error);
        const connection = await pool.getConnection();
        try { await saveBackfillProgress(connection, scopeId, entityType, offset, rowsSeen, "failed", code); }
        finally { connection.release(); }
        report.status = "failed";
        report.failed.push({ entityType, organizationId: scopeId, errorCode: code, resumedAtOffset: offset });
        return report;
      }
    }
  }
  return report;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const organizationIndex = args.indexOf("--organization-id");
  const entityIndex = args.indexOf("--entity");
  runInitialBackfill({
    organizationId: organizationIndex >= 0 ? args[organizationIndex + 1] : undefined,
    entityFilter: entityIndex >= 0 ? args[entityIndex + 1] : undefined,
  }).then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.status !== "completed") process.exitCode = 1;
  }).catch((error) => {
    console.error("MySQL backfill failed:", error?.code ?? error?.name ?? "backfill_error");
    process.exitCode = 1;
  }).finally(() => closeMySqlPool().catch(() => undefined));
}
