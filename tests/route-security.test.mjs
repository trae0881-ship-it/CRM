import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

test("direct Super Admin routes require verified membership", () => {
  assert.match(app, /path === "\/super-admin\/dashboard"/);
  assert.match(app, /path === "\/super-admin\/login"/);
  assert.match(app, /current\.role === "super_admin"/);
  assert.match(app, /current\.role !== "super_admin"/);
});
