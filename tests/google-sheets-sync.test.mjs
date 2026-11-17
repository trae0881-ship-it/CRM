import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Google Sheets lead mapping defines contact normalization and validation", async () => {
  const helper = await readFile(new URL("../src/lib/googleSheetsSync.ts", import.meta.url), "utf8");
  assert.match(helper, /normalizePhone/);
  assert.match(helper, /Invalid phone number/);
  assert.match(helper, /Invalid email address/);
});

test("Google Sheets source keys include a configured stable source id", async () => {
  const helper = await readFile(new URL("../src/lib/googleSheetsSync.ts", import.meta.url), "utf8");
  assert.match(helper, /row\.sourceId/);
  assert.match(helper, /spreadsheetId.*worksheetId/);
});

test("Google Sheets backend is server-only and pipeline movement is role-authorized", async () => {
  const oauth = await readFile(new URL("../supabase/functions/google-sheets-oauth/index.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../supabase/functions/google-sheets-sync/index.ts", import.meta.url), "utf8");
  const migration = await readFile(new URL("../supabase/migrations/202611020019_google_sheets_and_pipeline_access.sql", import.meta.url), "utf8");
  assert.match(oauth, /GOOGLE_CLIENT_SECRET/);
  assert.match(oauth, /GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY/);
  assert.match(sync, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(sync, /source_status: "missing"/);
  assert.match(migration, /google_sheet_integrations/);
  assert.match(migration, /Pipeline lead update access denied/);
  assert.match(migration, /is_team_manager/);
});

test("organization Integrations page exposes existing Google Sheets and WhatsApp workflows", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const routes = await readFile(new URL("../src/lib/roleRoutes.ts", import.meta.url), "utf8");
  const pageStart = app.indexOf("function Integrations(");
  const pageEnd = app.indexOf("\n}\n\nfunction PublicPage", pageStart);
  const page = app.slice(pageStart, pageEnd);

  assert.match(routes, /path: "\/org\/integrations", label: "Integrations"[\s\S]*roles: ownersAndAdmins/);
  assert.match(app, /view === "Integrations" && membership && <Integrations membership=\{membership\}/);
  assert.match(page, /<GoogleSheetsView membership=\{membership\} onNotify=\{onNotify\} \/>/);
  assert.match(page, /Business API not connected/);
  assert.match(page, /Personal click-to-chat is available from lead records/);
  assert.match(page, /href="\/org\/leads"/);
  assert.match(page, /whatsapp-business-setup/);
});
