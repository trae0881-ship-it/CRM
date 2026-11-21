import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("lead deletion is organization-admin guarded and soft-deletes active records", async () => {
  const migration = await readFile(path.join(root, "supabase/migrations/20261121140000_soft_delete_organization_lead.sql"), "utf8");
  assert.match(migration, /delete_organization_lead\(target_external_id text\)/i);
  assert.match(migration, /array\['company_owner','organization_admin'\]/i);
  assert.match(migration, /set deleted_at = now\(\)/i);
  assert.match(migration, /lead_deleted/i);
  assert.match(migration, /grant execute on function public\.delete_organization_lead\(text\) to authenticated/i);
});

test("lead list and details expose admin delete actions", async () => {
  const app = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const service = await readFile(path.join(root, "src/services/leads.ts"), "utf8");
  assert.match(app, /onDelete=\{removeLead\}/);
  assert.match(app, /canDelete=\{membership\?\.role === "company_owner"/);
  assert.match(app, /Delete lead/);
  assert.match(app, /lead_deleted/);
  assert.match(service, /rpc\("delete_organization_lead"/);
});
