import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sales agents get a personal dashboard with mobile-responsive performance and shortcuts", async () => {
  const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");

  assert.match(app, /if \(role === "agent"\) return <section className="sales-team-dashboard">/);
  assert.match(app, /performance\.assignedLeads/);
  assert.match(app, /href="\/org\/calling"/);
  assert.match(styles, /@media\(max-width:720px\)\{\.sales-team-dashboard/);
  assert.match(styles, /@media\(max-width:380px\)\{\.sales-dashboard-actions/);
});
