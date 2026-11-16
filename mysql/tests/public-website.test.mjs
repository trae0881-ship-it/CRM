import assert from "node:assert/strict";
import test from "node:test";
import { createRateLimiter, publicPricingPlan, validateContactPayload } from "../services/public-website.mjs";

const payload = {
  fullName: "Asha Rao",
  mobile: "+91 91615 33353",
  email: "ASHA@example.com",
  company: "",
  subject: "CRM enquiry",
  message: "Please share details about organizing our sales leads.",
  idempotencyKey: "b823ad4c-0274-4a14-9f48-08b59bc124e0",
};

test("public contact API validation normalizes fields and rejects honeypot or invalid data", () => {
  const valid = validateContactPayload(payload);
  assert.equal(valid.error, undefined);
  assert.equal(valid.value.email, "asha@example.com");
  assert.equal(valid.value.company, null);
  assert.match(validateContactPayload({ ...payload, website: "spam" }).error, /could not be accepted/);
  assert.match(validateContactPayload({ ...payload, mobile: "123" }).error, /mobile number/);
  assert.match(validateContactPayload({ ...payload, idempotencyKey: "not-a-uuid" }).error, /form session/);
});

test("public enquiry rate limiter resets after its fixed time window", () => {
  let now = 1000;
  const allow = createRateLimiter({ limit: 2, windowMs: 100, now: () => now });
  assert.equal(allow("client"), true);
  assert.equal(allow("client"), true);
  assert.equal(allow("client"), false);
  now += 100;
  assert.equal(allow("client"), true);
});

test("public plans expose only approved fields and reject invalid prices", () => {
  assert.deepEqual(publicPricingPlan({
    code: "starter", name: "Starter", description: "For small sales teams", currency_code: "INR",
    price_monthly: "1250.00", price_quarterly: "3500.00", price_half_yearly: "6800.00", price_yearly: "12000.00",
    max_users: 10, max_salespeople: 7, max_managers: 2, max_leads: 5000, trial_days: 14, validity_days: null,
    features: { reports: "basic", teams: true, sales_pipeline: true, automation: false, internal_note: "not public", api_key: "secret" },
  }), {
    code: "starter", name: "Starter", description: "For small sales teams", currencyCode: "INR",
    monthlyPrice: 1250, quarterlyPrice: 3500, halfYearlyPrice: 6800, yearlyPrice: 12000,
    maxUsers: 10, maxSalespeople: 7, maxManagers: 2, maxLeads: 5000, trialDays: 14, validityDays: null,
    features: { reports: "basic", teams: true, sales_pipeline: true, automation: false },
  });
  assert.throws(() => publicPricingPlan({ price_monthly: "invalid" }), /invalid_plan_price/);
});
