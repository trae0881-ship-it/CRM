function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required server environment variable: ${name}`);
  return value;
}

function integer(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

export function getMySqlConfig({ migration = false } = {}) {
  const host = required("MYSQL_HOST");
  if (host === "0.0.0.0" || host === "*") throw new Error("MYSQL_HOST must identify a private database host, not a bind-all address");
  const database = required("MYSQL_DATABASE");
  let user = required("MYSQL_USER");
  let password = required("MYSQL_PASSWORD");
  if (migration) {
    user = required("MYSQL_MIGRATION_USER");
    password = required("MYSQL_MIGRATION_PASSWORD");
  }
  const sslEnabled = boolean("MYSQL_SSL", true);
  const ca = process.env.MYSQL_SSL_CA?.trim();
  const allowSelfSigned = boolean("MYSQL_SSL_REJECT_UNAUTHORIZED", true);
  return {
    host,
    port: integer("MYSQL_PORT", 3306, 1, 65535),
    database,
    user,
    password,
    connectionLimit: integer("MYSQL_CONNECTION_LIMIT", 10, 1, 100),
    connectTimeout: integer("MYSQL_CONNECT_TIMEOUT_MS", 10000, 1000, 120000),
    ssl: sslEnabled
      ? { rejectUnauthorized: allowSelfSigned, ...(ca ? { ca } : {}) }
      : undefined,
  };
}

export function getSupabaseServerConfig() {
  return {
    url: required("SUPABASE_URL"),
    anonKey: process.env.SUPABASE_ANON_KEY?.trim() ?? "",
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function getRuntimeConfig() {
  return {
    apiPort: integer("DATABASE_API_PORT", Number(process.env.PORT ?? 8787), 1, 65535),
    apiAllowedOrigin: process.env.DATABASE_API_ALLOWED_ORIGIN?.trim() ?? "",
    syncBatchSize: integer("MYSQL_SYNC_BATCH_SIZE", 25, 1, 250),
    syncPollMs: integer("MYSQL_SYNC_POLL_MS", 2000, 250, 60000),
    syncWorkerId: process.env.MYSQL_SYNC_WORKER_ID?.trim() || `${process.pid}`,
  };
}
