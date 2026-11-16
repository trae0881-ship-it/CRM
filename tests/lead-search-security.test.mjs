import assert from "node:assert/strict";
import test from "node:test";
import { buildLeadSearchFilter } from "../src/lib/leadSearch.mjs";

test("lead search escapes PostgREST filter delimiters and ILIKE wildcards", () => {
  assert.equal(
    buildLeadSearchFilter('Acme, Inc. (North)"\\'),
    'full_name.ilike."%Acme, Inc. (North)\\"\\\\%",email.ilike."%Acme, Inc. (North)\\"\\\\%",phone.ilike."%Acme, Inc. (North)\\"\\\\%"',
  );
  assert.equal(
    buildLeadSearchFilter("%_"),
    'full_name.ilike."%\\%\\_%",email.ilike."%\\%\\_%",phone.ilike."%\\%\\_%"',
  );
});
