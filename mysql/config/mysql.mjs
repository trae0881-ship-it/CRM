import mysql from "mysql2/promise";
import { getMySqlConfig } from "./env.mjs";

let pool;
let migrationPool;
let closing = false;

export function getPool({ migration = false } = {}) {
  if (closing) throw new Error("MySQL pool is shutting down");
  const cachedPool = migration ? migrationPool : pool;
  if (cachedPool) return cachedPool;
  const nextPool = mysql.createPool({ ...getMySqlConfig({ migration }), waitForConnections: true, queueLimit: 100, enableKeepAlive: true, keepAliveInitialDelay: 0, dateStrings: false, timezone: "Z" });
  if (migration) migrationPool = nextPool;
  else pool = nextPool;
  return nextPool;
}

export async function checkMySqlConnection() {
  const connection = await getPool().getConnection();
  try {
    const [rows] = await connection.query("SELECT 1 AS healthy, VERSION() AS server_version");
    return { connected: rows[0]?.healthy === 1, serverVersion: rows[0]?.server_version ?? null };
  } finally {
    connection.release();
  }
}

export async function withTransaction(run) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    try { await connection.rollback(); } catch { /* Preserve the original transaction error. */ }
    throw error;
  } finally {
    connection.release();
  }
}

export async function closeMySqlPool() {
  if (!pool && !migrationPool) return;
  closing = true;
  await Promise.all([pool?.end(), migrationPool?.end()].filter(Boolean));
  pool = undefined;
  migrationPool = undefined;
}
