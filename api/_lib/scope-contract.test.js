import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateScope } from "./scope-guard.js";
import { scopeContractCases, scopeOutcome } from "./fixtures/scope-contract.js";

for (const { id, expected, query, history } of scopeContractCases) {
  test(`contrato ${id}: ${query}`, () => {
    assert.equal(scopeOutcome(evaluateScope(query, 0, history)), expected);
  });
}
