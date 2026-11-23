import assert from "node:assert/strict";
import test from "node:test";
import { createDatabaseServer } from "../services/server.mjs";

test("database health and organization operations reject requests without a verified bearer session", async () => {
  const server = createDatabaseServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  test("public contact API rejects invalid submissions without requiring database credentials", async () => {
    const server = createDatabaseServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    try {
      const response = await fetch(`http://127.0.0.1:${port}/public/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fullName: "A", email: "invalid" }),
      });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /name between 2 and 120/);
      const honeypot = await fetch(`http://127.0.0.1:${port}/public/contact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website: "bot-content" }),
      });
      assert.equal(honeypot.status, 400);
    } finally {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
  const { port } = server.address();
  try {
    for (const [path, method] of [
      ["/health/db", "GET"],
      ["/database/export", "GET"],
      ["/sync/replay", "POST"],
      ["/sync/reconcile", "POST"],
    ]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method });
      assert.equal(response.status, 403, `${method} ${path} must fail closed`);
      assert.deepEqual(await response.json(), { error: "Verified platform administrator access required" });
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
