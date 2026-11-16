import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("the project has a server-side MySQL replica implementation and no browser database credentials", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const envExample = await read(".env.example");
  const architecture = await read("docs/DATABASE_DUAL_ARCHITECTURE.md");
  const mysqlReadme = await read("mysql/README.md");
  const entities = await read("mysql/schemas/entities.mjs");
  const inventory = await read("ENVIRONMENT_VARIABLES.md");
  const frontend = await read("src/vite-env.d.ts");

  assert.ok(packageJson.dependencies.mysql2);
  assert.match(packageJson.scripts["mysql:worker"], /mysql\/sync\/worker\.mjs/);
  assert.match(packageJson.scripts["mysql:api"], /mysql\/services\/server\.mjs/);
  for (const name of ["MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD", "MYSQL_SSL"]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
  for (const name of ["MYSQL_TEST_DATABASE", "SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_ACCESS_TOKEN"]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
  assert.match(architecture, /Supabase PostgreSQL is the source of truth/);
  assert.match(architecture, /transaction triggers/);
  assert.match(mysqlReadme, /continuously running Node service\/worker/);
  assert.match(entities, /export const ENTITY_TABLES/);
  assert.doesNotMatch(frontend, /MYSQL_(?:HOST|USER|PASSWORD|DATABASE)/);
  assert.match(inventory, /No MySQL endpoint or credentials were configured/);
});

test("the Supabase browser and server configuration matches the application boundary", async () => {
  const envExample = await read(".env.example");
  const inventory = await read("ENVIRONMENT_VARIABLES.md");
  const client = await read("src/lib/supabase.ts");
  const deployment = await read("docs/DEPLOYMENT.md");
  const architecture = await read("docs/DATABASE_DUAL_ARCHITECTURE.md");
  const frontend = await read("src/vite-env.d.ts");

  for (const name of ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"]) {
    assert.match(client, new RegExp(`import\\.meta\\.env\\.${name}`));
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
  }
  for (const name of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    assert.match(envExample, new RegExp(`^${name}=`, "m"));
    assert.ok(inventory.includes(`\`${name}\``));
  }
  assert.doesNotMatch(frontend, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(deployment, /service-role key must never be embedded in the static build/);
  assert.match(architecture, /Supabase PostgreSQL is the source of truth/);
});

test("dual database documentation describes the actual JSON replica and live blockers", async () => {
  const architecture = await read("docs/DATABASE_DUAL_ARCHITECTURE.md");
  const deployment = await read("docs/DEPLOYMENT.md");
  const mysqlReadme = await read("mysql/README.md");

  assert.match(architecture, /MySQL is a read\/analytics replica/);
  assert.match(architecture, /typed relational replacement/);
  assert.match(architecture, /no cross-database atomic commit/i);
  assert.match(deployment, /Live MySQL connectivity and sync remain \*\*BLOCKED\*\*/);
  assert.match(mysqlReadme, /Live MySQL migration\/connection\/sync tests are \*\*BLOCKED\*\*/);
});

test("composite record keys are stable, unambiguous and shared with the outbox encoder", async () => {
  const { sourceRecordKey } = await import("../mysql/schemas/entities.mjs");
  const sql = await read("supabase/migrations/202611020025_mysql_sync_outbox.sql");
  const first = sourceRecordKey("google_sheet_source_rows", { integration_id: "a|b", source_row_key: "row.1" });
  const expected = `${Buffer.from("a|b").toString("base64url")}.${Buffer.from("row.1").toString("base64url")}`;

  assert.equal(first, expected);
  assert.match(sql, /mysql_sync_encode_key\(source_row ->> 'integration_id'\) \|\| '\.' \|\| public\.mysql_sync_encode_key\(source_row ->> 'source_row_key'\)/);
  assert.match(sql, /replace\(encode\(convert_to\(source, 'UTF8'\), 'base64'\), E'\\n', ''\)/);
});
