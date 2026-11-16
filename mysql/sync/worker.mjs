import { pathToFileURL } from "node:url";
import { closeMySqlPool, checkMySqlConnection } from "../config/mysql.mjs";
import { getRuntimeConfig } from "../config/env.mjs";
import { getSupabaseAdmin } from "../config/supabase.mjs";
import { processOutboxBatch } from "./outbox.mjs";

let stopping = false;
let wakeTimer;
let wakeCurrent;

async function wait(ms) {
  await new Promise((resolve) => {
    wakeCurrent = resolve;
    wakeTimer = setTimeout(() => {
      wakeCurrent = undefined;
      resolve();
    }, ms);
  });
}

export async function runWorker() {
  const { syncPollMs } = getRuntimeConfig();
  const supabase = getSupabaseAdmin();
  const { error: supabaseError } = await supabase.from("mysql_sync_outbox").select("event_id", { head: true, count: "exact" }).limit(1);
  if (supabaseError) throw new Error(`Supabase outbox unavailable (${supabaseError.code ?? "configuration_error"})`);
  const { error: rpcError } = await supabase.rpc("mysql_sync_health");
  if (rpcError) throw new Error(`Supabase sync migration unavailable (${rpcError.code ?? "migration_required"})`);
  const mysql = await checkMySqlConnection();
  if (!mysql.connected) throw new Error("MySQL health check failed");
  console.log("MySQL synchronization worker started");
  while (!stopping) {
    try {
      const results = await processOutboxBatch();
      if (!results.length) await wait(syncPollMs);
      else if (results.some((result) => result.status === "failed")) await wait(Math.min(syncPollMs, 1000));
    } catch (error) {
      console.error("Synchronization worker cycle failed:", error?.code ?? error?.name ?? "worker_error");
      await wait(syncPollMs);
    }
  }
}

export function stopWorker() {
  stopping = true;
  clearTimeout(wakeTimer);
  wakeCurrent?.();
  wakeCurrent = undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const shutdown = async (workerPromise) => {
    stopWorker();
    await workerPromise.catch(() => undefined);
    await closeMySqlPool();
  };
  const workerPromise = runWorker().catch((error) => {
    console.error("Synchronization worker could not start:", error?.code ?? error?.name ?? "startup_error");
    process.exitCode = 1;
  });
  process.once("SIGINT", () => { void shutdown(workerPromise); });
  process.once("SIGTERM", () => { void shutdown(workerPromise); });
  workerPromise.finally(() => closeMySqlPool().catch(() => undefined));
}
