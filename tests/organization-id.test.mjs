import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/organizationId.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const module = { exports: {} };
new Function("exports", "module", compiled)(module.exports, module);

test("organization IDs must be complete UUIDs before use in organization operations", () => {
  const { isOrganizationId } = module.exports;
  assert.equal(isOrganizationId("35d9cb88-486e-47b6-bbea-6342f2c1795d"), true);
  assert.equal(isOrganizationId(undefined), false);
  assert.equal(isOrganizationId(null), false);
  assert.equal(isOrganizationId(""), false);
  assert.equal(isOrganizationId("undefined"), false);
  assert.equal(isOrganizationId("35d9cb88-486e-47b6"), false);
});
