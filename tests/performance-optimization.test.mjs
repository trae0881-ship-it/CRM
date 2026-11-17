import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("heavy views are lazy-loaded instead of included in the initial app module", async () => {
  const app = await read("src/App.tsx");
  assert.match(app, /lazy\(\(\) => import\("\.\/components\/OperationsViews"\)/);
  assert.match(app, /lazy\(\(\) => import\("\.\/components\/PlatformAdminView"\)/);
  assert.match(app, /lazy\(\(\) => import\("\.\/components\/PublicPages"\)/);
  assert.doesNotMatch(app, /^import\s+\{\s*ReportsView/m);
});

test("lazy dashboard views are rendered inside the route loading boundary", async () => {
  const app = await read("src/App.tsx");
  const pageContent = app.slice(app.indexOf('<div className="page-content">'), app.indexOf("</div>\n      </main>"));
  const boundaryStart = pageContent.indexOf("<Suspense fallback=");
  const boundaryEnd = pageContent.lastIndexOf("</Suspense>");
  for (const component of ["PlatformAdminView", "GrowthToolsView", "LicenseRegisterView", "DatabaseMonitoringView", "SalesPipelineView", "Customer360View"]) {
    const renderPosition = pageContent.indexOf(`<${component} `);
    assert.ok(renderPosition > boundaryStart && renderPosition < boundaryEnd, `${component} should be inside the route loading boundary`);
  }
});

test("lead queries request bounded server pages and support cancellation", async () => {
  const service = await read("src/services/leads.ts");
  assert.match(service, /Math\.min\(100, Math\.max\(1, Math\.floor\(options\.limit \?\? 50\)\)\)/);
  assert.match(service, /\.range\(offset, offset \+ limit - 1\)/);
  assert.match(service, /\.abortSignal\(options\.signal\)/);
  assert.match(service, /count: "exact"/);
});

test("unread notification badge uses a tenant-scoped count query", async () => {
  const service = await read("src/services/operations.ts");
  assert.match(service, /countUnreadNotifications\(organizationId: string, userId: string\)/);
  assert.match(service, /select\("id", \{ count: "exact", head: true \}\)[\s\S]*?eq\("organization_id", organizationId\)\.eq\("user_id", userId\)\.is\("read_at", null\)/);
  const migration = await read("supabase/migrations/20261116175800_performance_indexes.sql");
  assert.match(migration, /on public\.notifications \(organization_id, user_id\)\s+where read_at is null/i);
});

test("application styles do not block initial render on a remote font stylesheet", async () => {
  const styles = await read("src/styles.css");
  assert.doesNotMatch(styles, /@import\s+url\(["']https?:\/\//i);
  assert.match(styles, /font-family:system-ui/);
});

test("Apache compresses text assets and caches only fingerprinted bundles", async () => {
  const config = await read("public/.htaccess");
  assert.match(config, /<IfModule mod_deflate\.c>/);
  assert.ok(config.includes('FilesMatch "\\.[A-Za-z0-9_-]{8}\\.(?:css|js)$"'));
  assert.match(config, /Cache-Control "no-cache, must-revalidate"/);
});
