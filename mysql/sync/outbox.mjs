import { getRuntimeConfig } from "../config/env.mjs";
import { getSupabaseAdmin } from "../config/supabase.mjs";
import { applyOutboxEvent } from "../repositories/records.mjs";

function safeErrorCode(error) {
  const code = error?.code ?? error?.name ?? "sync_failed";
  return String(code).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 96) || "sync_failed";
}

export async function processOutboxBatch({ batchSize = getRuntimeConfig().syncBatchSize, workerId = getRuntimeConfig().syncWorkerId } = {}) {
  const supabase = getSupabaseAdmin();
  const { data: events, error } = await supabase.rpc("claim_mysql_sync_outbox", {
    batch_size: batchSize,
    worker_id: workerId,
  });
  if (error) throw new Error(`Could not claim synchronization events (${error.code ?? "supabase_rpc_error"})`);
  const results = [];
  for (const event of events ?? []) {
    try {
      await applyOutboxEvent(event);
      const { data: completed, error: completeError } = await supabase.rpc("complete_mysql_sync_event", {
        target_event: event.event_id,
        worker_id: workerId,
      });
      if (completeError || completed !== true) throw new Error(`Could not acknowledge synchronization event (${completeError?.code ?? "lease_lost"})`);
      results.push({ eventId: event.event_id, status: "completed" });
    } catch (error) {
      const { error: failError } = await supabase.rpc("fail_mysql_sync_event", {
        target_event: event.event_id,
        worker_id: workerId,
        safe_error_code: safeErrorCode(error),
      });
      results.push({ eventId: event.event_id, status: "failed", errorCode: safeErrorCode(error) });
      if (failError) console.error("Could not record synchronization failure:", failError.code ?? "supabase_rpc_error");
    }
  }
  return results;
}

export { safeErrorCode };
