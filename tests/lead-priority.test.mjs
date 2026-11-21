import test from "node:test";
import assert from "node:assert/strict";

const priorityModule = await import("../src/lib/leadPriority.ts");

const base = {
  id: "lead-1",
  priority: "normal",
  status: "new",
  nextFollowUpAt: null,
  createdAt: "2026-10-01T10:00:00.000Z",
  lastSuccessfulContactAt: null,
  siteVisitAt: null,
  bookingStatus: null,
};

test("overdue follow-up is always P1", () => {
  const result = priorityModule.calculateLeadPriority({ ...base, nextFollowUpAt: "2026-11-01T10:00:00.000Z" }, new Date("2026-11-02T10:00:00.000Z"));
  assert.equal(result.level, "P1");
  assert.equal(result.reason, "Overdue follow-up");
});

test("calling queue orders urgency before normal leads", () => {
  const result = priorityModule.orderCallingQueue([
    base,
    { ...base, id: "lead-2", nextFollowUpAt: "2026-11-01T10:00:00.000Z" },
  ], new Date("2026-11-02T10:00:00.000Z"));
  assert.equal(result[0].id, "lead-2");
});

test("calling queue puts booked leads before new leads, even if a new lead has an overdue follow-up", () => {
  const result = priorityModule.orderCallingQueue([
    { ...base, id: "new-lead", nextFollowUpAt: "2026-11-01T10:00:00.000Z" },
    { ...base, id: "booked-lead", bookingStatus: "booked" },
  ], new Date("2026-11-02T10:00:00.000Z"));
  assert.equal(result[0].id, "booked-lead");
  assert.equal(result[1].id, "new-lead");
});

