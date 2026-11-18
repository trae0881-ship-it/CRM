import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

test("Google Sheets links and IDs normalize to a spreadsheet ID", async () => {
  const helper = await readFile(new URL("../src/lib/googleSheetsSync.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(helper, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  runInNewContext(compiled, { exports, URL, URLSearchParams });
  const normalize = exports.normalizeGoogleSpreadsheetId;
  const parseReference = exports.parseGoogleSpreadsheetReference;

  assert.equal(normalize(" https://docs.google.com/spreadsheets/d/sheet_id-123/edit?gid=0 "), "sheet_id-123");
  assert.equal(normalize("sheet_id-123"), "sheet_id-123");
  const reference = parseReference("https://docs.google.com/spreadsheets/d/1aDOn-YOFut16E3b6Thi7bYA2BcO53bH-SvtovH9T-tY/edit?gid=267409442#gid=267409442");
  assert.equal(reference.spreadsheetId, "1aDOn-YOFut16E3b6Thi7bYA2BcO53bH-SvtovH9T-tY");
  assert.equal(reference.worksheetId, "267409442");
  assert.throws(() => normalize("https://docs.google.com/document/d/not-a-sheet"), /Google Sheets link/);
  assert.throws(() => normalize("https://example.com/spreadsheets/d/sheet_id-123"), /Google Sheets link/);
});

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
  const workspace = await readFile(new URL("../src/services/workspace.ts", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/services/googleSheets.ts", import.meta.url), "utf8");
  assert.match(oauth, /GOOGLE_CLIENT_SECRET/);
  assert.match(oauth, /GOOGLE_SHEETS_TOKEN_ENCRYPTION_KEY/);
  assert.match(oauth, /new URL\("\/functions\/v1\/google-sheets-oauth", env\("SUPABASE_URL"\)\)/);
  assert.match(oauth, /redirect_uri: getRedirectUri\(\)/);
  assert.match(oauth, /organizationIdPattern\.test\(body\.organizationId\)/);
  assert.doesNotMatch(oauth, /env\("GOOGLE_SHEETS_REDIRECT_URI"\)/);
  assert.match(workspace, /isOrganizationId\(membership\.organization_id\)/);
  assert.match(service, /isOrganizationId\(organizationId\)/);
  assert.match(sync, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(sync, /source_status: "missing"/);
  assert.match(migration, /google_sheet_integrations/);
  assert.match(migration, /Pipeline lead update access denied/);
  assert.match(migration, /is_team_manager/);
});

test("Google Sheets Edge Functions handle browser preflight and notify the OAuth opener", async () => {
  const oauth = await readFile(new URL("../supabase/functions/google-sheets-oauth/index.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../supabase/functions/google-sheets-sync/index.ts", import.meta.url), "utf8");
  assert.match(oauth, /access-control-allow-origin/);
  assert.match(oauth, /request\.method === "OPTIONS"/);
  assert.match(oauth, /adometa-google-sheets-\$\{result\}/);
  assert.match(sync, /access-control-allow-origin/);
  assert.match(sync, /request\.method === "OPTIONS"/);
});

test("Google Sheets import selects the linked tab and preserves every sheet column", async () => {
  const view = await readFile(new URL("../src/components/GoogleSheetsView.tsx", import.meta.url), "utf8");
  const sync = await readFile(new URL("../supabase/functions/google-sheets-sync/index.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(view, /Google Sheets link or ID/);
  assert.match(view, /parseGoogleSpreadsheetReference\(input\)/);
  assert.match(view, /onPaste=\{\(event\).*saveAndImport\(integration, pasted\)/);
  assert.match(view, /Save & Import Leads/);
  assert.match(view, /await saveSettings\(integration, integration\.auto_sync, input\);\s*const result = await syncGoogleSheet/);
  assert.match(sync, /String\(sheet\.properties\?\.sheetId\) === String\(integration\.worksheet_id\)/);
  assert.match(sync, /requestedWorksheetName === "Sheet1" \? metadata\.sheets\?\.\[0\]/);
  assert.match(sync, /const quotedWorksheetName = worksheetName\.replace\(\/'\/g, "''"\)/);
  assert.match(sync, /Object\.fromEntries\(headers\.map/);
  assert.match(app, /Imported sheet details/);
  assert.match(sync, /const range = `'\$\{quotedWorksheetName\}'!A1:ZZ/);
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

test("Google OAuth opens synchronously, validates its callback source, and refreshes integrations", async () => {
  const view = await readFile(new URL("../src/components/GoogleSheetsView.tsx", import.meta.url), "utf8");
  const service = await readFile(new URL("../src/services/googleSheets.ts", import.meta.url), "utf8");
  assert.ok(view.indexOf('window.open("about:blank"') < view.indexOf("await startGoogleOAuth("));
  assert.match(view, /validOrganizationId = isOrganizationId\(membership\.organization_id\)/);
  assert.match(view, /!validOrganizationId[\s\S]*?return;/);
  assert.match(view, /event\.origin !== supabaseOrigin \|\| event\.source !== popupRef\.current/);
  assert.match(view, /"adometa-google-sheets-connected", "adometa-google-sheets-error"/);
  assert.match(service, /error\.context instanceof Response/);
  assert.match(service, /typeof payload\?\.error === "string"/);
});

test("Google Sheets setup documents free-tier prerequisites and the public OAuth callback deployment", async () => {
  const docs = await readFile(new URL("../GOOGLE_SHEETS_INTEGRATION.md", import.meta.url), "utf8");
  assert.match(docs, /Supabase's free tier can host/);
  assert.match(docs, /callback URI is derived from the server-side `SUPABASE_URL`/);
  assert.match(docs, /Register the exact callback URL/);
  assert.match(docs, /google-sheets-oauth --no-verify-jwt/);
  assert.match(docs, /bearer token and organization-admin membership/);
  assert.match(docs, /Pasting a link automatically saves it and starts the import/);
  assert.match(docs, /preserves every non-empty source column/);
});

test("Google Sheets connection reports Edge Function reachability failures with deployment guidance", async () => {
  const service = await readFile(new URL("../src/services/googleSheets.ts", import.meta.url), "utf8");
  const docs = await readFile(new URL("../GOOGLE_SHEETS_INTEGRATION.md", import.meta.url), "utf8");
  assert.match(service, /error\.name === "FunctionsFetchError"/);
  assert.match(service, /same Supabase project as VITE_SUPABASE_URL/);
  assert.match(service, /Enabling Google under Supabase Auth providers does not deploy this function/);
  assert.match(docs, /Failed to send a request to the Edge Function/);
  assert.match(docs, /Deploy the current function source/i);
});
