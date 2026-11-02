import test from "node:test";
import assert from "node:assert/strict";
const callState = await import("../src/lib/callState.ts");
const reports = await import("../src/lib/reports.ts");
const whatsapp = await import("../src/lib/whatsapp.ts");

test("call state machine rejects invalid transitions and calculates duration", () => {
  assert.equal(callState.advanceCall("ringing", "connected"), "connected");
  assert.throws(() => callState.advanceCall("disconnected", "connected"));
  assert.equal(callState.callDurationSeconds("2026-11-02T10:00:00Z", "2026-11-02T10:01:05Z"), 65);
});

test("report generators produce CSV, Excel HTML, and PDF output", () => {
  const rows = [{ Lead: "A-1", Status: "New" }];
  assert.match(reports.toCsv(rows, ["Lead", "Status"]), /"A-1","New"/);
  assert.match(reports.toExcelHtml(rows, ["Lead", "Status"]), /<table>/);
  assert.match(reports.toSimplePdf(rows, ["Lead", "Status"]), /^%PDF-1\.4/);
});

test("report exports neutralize spreadsheet formulas and HTML markup", () => {
  const rows = [{ Lead: "=HYPERLINK(\"https://evil.example\")", Status: "<script>alert(1)</script>" }];
  assert.match(reports.toCsv(rows, ["Lead", "Status"]), /"'=HYPERLINK/);
  assert.doesNotMatch(reports.toExcelHtml(rows, ["Lead", "Status"]), /<script>/);
  assert.match(reports.toExcelHtml(rows, ["Lead", "Status"]), /&lt;script&gt;/);
});

test("WhatsApp templates render fields and use official click-to-chat links", () => {
  assert.equal(whatsapp.renderWhatsAppTemplate("Hi {{name}}", { name: "Riya" }), "Hi Riya");
  assert.match(whatsapp.personalWhatsAppUrl("+91 98765 43210", "Hello"), /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.throws(() => whatsapp.personalWhatsAppUrl("", "Hello"));
});
