import { getPool } from "../config/mysql.mjs";
import { getSupabaseAdmin } from "../config/supabase.mjs";
import { ENTITY_TABLES, sourceRecordKey, stripSecrets } from "../schemas/entities.mjs";

const GLOBAL_ENTITIES = new Set([
  "profiles", "meta_forms", "webhook_events", "subscription_plans",
  "payment_gateway_configs", "payment_webhook_deliveries", "pipeline_stages",
]);

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function ordered(query, entityType) {
  const keys = entityType === "organization_members" ? ["organization_id", "user_id"]
    : entityType === "team_members" ? ["organization_id", "team_id", "user_id"]
      : entityType === "payment_gateway_configs" ? ["provider"]
        : ["id"];
  return keys.reduce((current, key) => current.order(key), query);
}

export async function reconcileOrganization(organizationId) {
  const client = getSupabaseAdmin();
  const pool = getPool();
  const report = { organizationId, status: "completed", entities: {}, mismatches: 0 };
  for (const entityType of ENTITY_TABLES) {
    if (GLOBAL_ENTITIES.has(entityType)) continue;
    let offset = 0;
    let sourceCount = 0;
    let activeSourceCount = 0;
    let missing = 0;
    let mismatched = 0;
    for (;;) {
      let query = client.from(entityType).select("*", { count: "exact" });
      query = entityType === "organizations"
        ? query.eq("id", organizationId)
        : query.eq("organization_id", organizationId);
      const { data, error, count } = await ordered(query, entityType).range(offset, offset + 249);
      if (error) throw new Error(`Supabase reconciliation query failed for ${entityType} (${error.code ?? "query_error"})`);
      if (!data?.length) break;
      sourceCount += data.length;
      activeSourceCount += data.filter((record) => !record.deleted_at).length;
      const rows = data.map((record) => ({ record, key: sourceRecordKey(entityType, record) }));
      const table = `\`crm_mirror_${entityType}\``;
      const placeholders = rows.map(() => "?").join(",");
      const [mirrored] = await pool.execute(
        `SELECT source_record_key, payload FROM ${table} WHERE source_record_key IN (${placeholders})`,
        rows.map((row) => row.key),
      );
      const byKey = new Map(mirrored.map((row) => [row.source_record_key, row.payload]));
      for (const { record, key } of rows) {
        if (!byKey.has(key)) {
          missing += 1;
          continue;
        }
        const source = stripSecrets(record);
        const copy = typeof byKey.get(key) === "string" ? JSON.parse(byKey.get(key)) : byKey.get(key);
        if (stable(source) !== stable(copy)) mismatched += 1;
      }
      offset += data.length;
      if (count !== null && offset >= count) break;
    }
    const table = `\`crm_mirror_${entityType}\``;
    const [replicaCountRows] = await pool.execute(
      `SELECT COUNT(*) AS active_records FROM ${table} WHERE organization_id = ? AND deleted_at IS NULL`,
      [organizationId],
    );
    const extra = Math.max(0, Number(replicaCountRows[0]?.active_records ?? 0) - activeSourceCount);
    report.entities[entityType] = { sourceCount, missing, mismatched, extra };
    report.mismatches += missing + mismatched + extra;
  }
  if (report.mismatches) report.status = "mismatch";
  return report;
}

export async function reconcileAllOrganizations() {
  const { data, error } = await getSupabaseAdmin().from("organizations").select("id").order("id");
  if (error) throw new Error(`Could not list organizations for reconciliation (${error.code ?? "query_error"})`);
  const reports = [];
  for (const organization of data ?? []) reports.push(await reconcileOrganization(organization.id));
  return reports;
}
