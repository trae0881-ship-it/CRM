import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { hmacSha256, safeEqual } from "./crypto.ts";

Deno.test("creates and validates Meta sha256 signatures", async () => {
  const signature = await hmacSha256("test-secret", '{"entry":[]}');
  assert(safeEqual(`sha256=${signature}`, `sha256=${signature}`));
  assertEquals(safeEqual(`sha256=${signature}`, "sha256=invalid"), false);
});
