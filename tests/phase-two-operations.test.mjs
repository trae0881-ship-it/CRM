import test from "node:test";
import assert from "node:assert/strict";
import { bookingPendingAmount, filterDateRange, validateVisitTransition } from "../src/lib/operations.ts";
import { toXlsx } from "../src/lib/xlsx.ts";

test("booking amounts reject overpayment and calculate pending balance", () => {
  assert.equal(bookingPendingAmount(1000, 250), 750);
  assert.throws(() => bookingPendingAmount(1000, 1001), /cannot exceed/);
});

test("site visit lifecycle rejects changes after terminal states", () => {
  validateVisitTransition("scheduled", "confirmed");
  validateVisitTransition("confirmed", "completed");
  assert.throws(() => validateVisitTransition("completed", "rescheduled"), /Cannot change/);
});

test("report date filters use calendar boundaries", () => {
  const now = new Date("2026-11-02T12:00:00Z");
  assert.equal(filterDateRange("2026-11-02T01:00:00Z", "today", now), true);
  assert.equal(filterDateRange("2026-11-01T12:00:00Z", "today", now), false);
  assert.equal(filterDateRange("2026-10-31T12:00:00Z", "last_7_days", now), true);
});

test("XLSX export produces an OOXML zip signature", () => {
  const bytes = new Uint8Array(toXlsx([{ name: "Rohan", status: "new" }], ["name", "status"]));
  assert.deepEqual(Array.from(bytes.slice(0, 2)), [80, 75]);
  assert.ok(bytes.byteLength > 100);
});
