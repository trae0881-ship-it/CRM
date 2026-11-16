import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Database, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { Membership } from "../services/workspace";

type Props = { membership: Membership; session: Session | null; onNotify: (message: string) => void };
type OrganizationStatus = {
  organizationId: string;
  mysqlRecords: number;
  mysqlTombstones: number;
  pending: number;
  processing: number;
  failed: number;
  lastSuccessfulSyncAt: string | null;
};
type Health = {
  supabase: { connected: boolean; errorCode: string | null };
  mysql: { connected: boolean; errorCode: string | null };
  synchronization: {
    available: boolean;
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    lastSuccessfulSyncAt: string | null;
    lastErrorCode: string | null;
    totalSynchronizedRecords: number;
    byEntity: Array<{ entityType: string; records: number; tombstones: number }>;
    byOrganization: OrganizationStatus[];
  };
};

const apiBase = import.meta.env.VITE_DATABASE_API_URL?.trim().replace(/\/+$/, "") ?? "";

export function DatabaseMonitoringView({ membership, session, onNotify }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyOrganization, setBusyOrganization] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const isPlatformAdmin = membership.role === "super_admin" && membership.is_active;

  const loadHealth = useCallback(async () => {
    if (!isPlatformAdmin || !session || !apiBase || !supabase) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Your verified platform session could not be refreshed.");
      const response = await fetch(`${apiBase}/health/db`, {
        headers: { authorization: `Bearer ${data.session.access_token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 403 ? "The database API did not verify Super Admin access." : "Database status could not be loaded.");
      setHealth(await response.json() as Health);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Database status could not be loaded.";
      setErrorMessage(message);
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, [isPlatformAdmin, session]);

  useEffect(() => { void loadHealth(); }, [loadHealth]);

  const operate = async (organizationId: string, operation: "replay" | "reconcile") => {
    if (!isPlatformAdmin || !session || !apiBase || !supabase) return;
    setBusyOrganization(organizationId);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Your verified platform session could not be refreshed.");
      const response = await fetch(`${apiBase}/sync/${operation}`, {
        method: "POST",
        headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (!response.ok) throw new Error("The requested sync operation could not be completed.");
      const result = await response.json() as { replayQueued?: number; mismatches?: number; status?: string };
      onNotify(operation === "replay"
        ? `Queued ${result.replayQueued ?? 0} failed sync events for retry.`
        : `Reconciliation finished: ${result.mismatches ?? 0} mismatch(es) found.`);
      await loadHealth();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "The sync operation failed.");
    } finally {
      setBusyOrganization("");
    }
  };

  if (!isPlatformAdmin) return <section className="card pending-module"><ShieldAlert size={24} /><h2>Platform administrator access required</h2></section>;
  if (!apiBase) return <><header className="page-header"><div><p className="eyebrow">DATABASE OPERATIONS</p><h1>Database monitoring</h1><p className="muted">Server-verified Supabase and MySQL replication status.</p></div></header><section className="card database-blocked"><ShieldAlert size={22} /><div><strong>Monitoring API is not configured</strong><p>Set the public API origin in VITE_DATABASE_API_URL and configure the server-side database service separately.</p></div></section></>;

  const stateCard = (title: string, connected: boolean | undefined, code: string | null | undefined) => <section className="card database-status-card" key={title}>
    <div><p>{title}</p><strong>{connected === undefined ? "Unknown" : connected ? "Connected" : "Not connected"}</strong>{code && <small>Safe error code: {code}</small>}</div>
    {connected ? <CheckCircle2 size={22} /> : connected === false ? <XCircle size={22} /> : <Database size={22} />}
  </section>;

  return <>
    <header className="page-header"><div><p className="eyebrow">DATABASE OPERATIONS</p><h1>Database monitoring</h1><p className="muted">Server-verified database status and Supabase-to-MySQL synchronization.</p></div><button className="button secondary" onClick={() => void loadHealth()} disabled={loading}><RefreshCw size={15} />{loading ? "Refreshing…" : "Refresh"}</button></header>
    {errorMessage && <section className="database-error" role="alert"><ShieldAlert size={17} />{errorMessage}</section>}
    <div className="database-status-grid">{stateCard("Supabase PostgreSQL", health?.supabase.connected, health?.supabase.errorCode)}{stateCard("MySQL replica", health?.mysql.connected, health?.mysql.errorCode)}{stateCard("Synchronization", health?.synchronization.available, health?.synchronization.lastErrorCode)}</div>
    <section className="stats-grid database-sync-stats">
      <div className="stat-card"><div className="stat-top"><span>Pending events</span><Activity size={16} /></div><strong>{health?.synchronization.pending ?? "—"}</strong></div>
      <div className="stat-card"><div className="stat-top"><span>Failed events</span><ShieldAlert size={16} /></div><strong>{health?.synchronization.failed ?? "—"}</strong></div>
      <div className="stat-card"><div className="stat-top"><span>Synchronized records</span><Database size={16} /></div><strong>{health?.synchronization.totalSynchronizedRecords ?? "—"}</strong></div>
      <div className="stat-card"><div className="stat-top"><span>Last successful sync</span><CheckCircle2 size={16} /></div><strong className="database-time">{health?.synchronization.lastSuccessfulSyncAt ? new Date(health.synchronization.lastSuccessfulSyncAt).toLocaleString() : "—"}</strong></div>
    </section>
    {health?.synchronization.byOrganization.length ? <section className="card table-card database-org-card"><div className="card-header"><div><h2>Organization sync status</h2><p>Actions operate only on the selected organization.</p></div></div><div className="table-scroll"><table><thead><tr><th>ORGANIZATION ID</th><th>MYSQL RECORDS</th><th>PENDING</th><th>FAILED</th><th>LAST SYNC</th><th>ACTIONS</th></tr></thead><tbody>{health.synchronization.byOrganization.map((row) => <tr key={row.organizationId}><td>{row.organizationId}</td><td>{row.mysqlRecords}</td><td>{row.pending}</td><td>{row.failed}</td><td>{row.lastSuccessfulSyncAt ? new Date(row.lastSuccessfulSyncAt).toLocaleString() : "—"}</td><td><div className="database-actions"><button className="button secondary" disabled={Boolean(busyOrganization)} onClick={() => void operate(row.organizationId, "replay")}>Retry failed</button><button className="button secondary" disabled={Boolean(busyOrganization)} onClick={() => void operate(row.organizationId, "reconcile")}>{busyOrganization === row.organizationId ? "Working…" : "Reconcile"}</button></div></td></tr>)}</tbody></table></div></section> : !loading && <section className="card"><p className="muted">No organization synchronization events are available.</p></section>}
    {health?.synchronization.byEntity.length ? <section className="card table-card database-org-card"><div className="card-header"><div><h2>Replica records by entity</h2><p>Soft-delete tombstones remain in the replica.</p></div></div><div className="table-scroll"><table><thead><tr><th>ENTITY</th><th>RECORDS</th><th>TOMBSTONES</th></tr></thead><tbody>{health.synchronization.byEntity.map((row) => <tr key={row.entityType}><td>{row.entityType}</td><td>{row.records}</td><td>{row.tombstones}</td></tr>)}</tbody></table></div></section> : null}
  </>;
}
