import { pathToFileURL } from "node:url";
import { closeMySqlPool } from "../config/mysql.mjs";
import { getSupabaseAdmin } from "../config/supabase.mjs";
import { reconcileAllOrganizations, reconcileOrganization } from "../sync/reconcile.mjs";

async function main() {
  const args = process.argv.slice(2);
  const organizationIndex = args.indexOf("--organization-id");
  const organizationId = organizationIndex >= 0 ? args[organizationIndex + 1] : undefined;
  const reports = organizationId
    ? [await reconcileOrganization(organizationId)]
    : await reconcileAllOrganizations();
  const health = await getSupabaseAdmin().rpc("mysql_sync_health");
  if (health.error) throw new Error(`Could not read outbox health (${health.error.code ?? "supabase_rpc_error"})`);
  const result = {
    status: reports.every((report) => report.status === "completed") ? "completed" : "mismatch",
    organizations: reports,
    outbox: health.data,
    repair: "No records were modified. Retry failed outbox events with /sync/replay, then rerun reconciliation.",
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.status !== "completed") process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("MySQL reconciliation failed:", error?.code ?? error?.name ?? "reconciliation_error");
    process.exitCode = 1;
  }).finally(() => closeMySqlPool().catch(() => undefined));
}
