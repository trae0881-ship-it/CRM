import { pathToFileURL } from "node:url";
import { getPool, closeMySqlPool } from "../config/mysql.mjs";
import { migration as initialSchema } from "../migrations/001_sync_schema.mjs";
import { migration as contactSchema } from "../migrations/002_contact_submissions.mjs";

async function applyMigrations() {
  const pool = getPool({ migration: true });
  const connection = await pool.getConnection();
  try {
    const [lockRows] = await connection.query("SELECT GET_LOCK(?, 30) AS acquired", ["adometa_mysql_migrations"]);
    if (lockRows[0]?.acquired !== 1) throw new Error("Could not acquire the database migration lock");
    await connection.query(`CREATE TABLE IF NOT EXISTS mysql_schema_migrations (
      version VARCHAR(128) NOT NULL PRIMARY KEY,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARACTER SET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    for (const [version, migration] of [
      ["001_sync_schema", initialSchema],
      ["002_contact_submissions", contactSchema],
    ]) {
      const [existing] = await connection.execute("SELECT version FROM mysql_schema_migrations WHERE version = ?", [version]);
      if (!existing.length) {
        for (const statement of migration.split(";").map((item) => item.trim()).filter(Boolean)) {
          await connection.query(statement);
        }
        await connection.execute("INSERT INTO mysql_schema_migrations (version) VALUES (?)", [version]);
        console.log(`Applied ${version}`);
      } else {
        console.log(`${version} already applied`);
      }
    }
  } finally {
    await connection.query("SELECT RELEASE_LOCK(?)", ["adometa_mysql_migrations"]).catch(() => undefined);
    connection.release();
    await closeMySqlPool();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  applyMigrations().catch((error) => {
    console.error("MySQL migration failed:", error?.code ?? error?.name ?? "database_error");
    process.exitCode = 1;
  });
}

export { applyMigrations };
