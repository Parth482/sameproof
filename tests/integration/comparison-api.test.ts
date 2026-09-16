import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST as createComparison } from "@/app/api/comparisons/route";
import { DELETE as deleteComparison, GET as getComparison, PATCH as updateComparison } from "@/app/api/comparisons/[comparisonId]/route";
import { POST as evaluateComparison } from "@/app/api/comparisons/[comparisonId]/evaluate/route";
import { POST as createPassport } from "@/app/api/comparisons/[comparisonId]/passport/route";
import { GET as getPublicPassport } from "@/app/api/passports/[publicToken]/route";
import type { Comparison } from "@/models/domain";

function request(path: string, method: string, body?: unknown) {
  return new Request(`http://sameproof.test${path}`, {
    method,
    headers: { "content-type": "application/json", "x-request-id": "integration-test" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function confirmEvidence(comparison: Comparison) {
  return {
    target: Object.fromEntries(Object.entries(comparison.evidence.target).map(([key, field]) => [key, { ...field, state: field.value === null ? "unknown" : "confirmed", userConfirmed: true }])),
    competitor: Object.fromEntries(Object.entries(comparison.evidence.competitor).map(([key, field]) => [key, { ...field, state: field.value === null ? "unknown" : "confirmed", userConfirmed: true }])),
  } as Comparison["evidence"];
}

async function createExactComparison() {
  const response = await createComparison(request("/api/comparisons", "POST", {
    targetListingId: "lst-ow-dell",
    competitorListingId: "lst-cc-dell-exact",
    context: {
      postcode: "3000",
      fulfilment: "delivery",
      mustHave: ["exact_identity", "new_condition"],
      flexible: ["delivery", "lowest_total", "fresh_evidence"],
    },
  }), undefined);
  expect(response.status).toBe(201);
  return (await response.json()).comparison as Comparison;
}

describe("comparison API journey", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("binds a passport to a current immutable server decision", async () => {
    const created = await createExactComparison();
    const context = { params: Promise.resolve({ comparisonId: created.id }) };
    const patchResponse = await updateComparison(request(`/api/comparisons/${created.id}`, "PATCH", {
      expectedVersion: created.version,
      stage: "identity_bridge",
      evidence: confirmEvidence(created),
      evidenceConfirmed: true,
    }), context);
    expect(patchResponse.status).toBe(200);
    await patchResponse.json();

    const evaluationResponse = await evaluateComparison(request(`/api/comparisons/${created.id}/evaluate`, "POST", {}), context);
    expect(evaluationResponse.status).toBe(200);
    const evaluation = await evaluationResponse.json();
    expect(evaluation.decision.status).toBe("verified");
    expect(evaluation.decision.comparisonVersion).toBe(evaluation.comparison.version);

    const passportResponse = await createPassport(request(`/api/comparisons/${created.id}/passport`, "POST", {}), context);
    expect(passportResponse.status).toBe(201);
    const issued = await passportResponse.json();
    expect(issued.passport.publicTokenHash).toBeUndefined();
    expect(issued.passport.integrityHash).toMatch(/^[a-f0-9]{64}$/);

    const publicResponse = await getPublicPassport(request(`/api/passports/${issued.publicToken}`, "GET"), { params: Promise.resolve({ publicToken: issued.publicToken }) });
    expect(publicResponse.status).toBe(200);
    const opened = await publicResponse.json();
    expect(opened.passport.decisionId).toBe(issued.passport.decisionId);
  });

  it("rejects an outdated browser tab with a controlled conflict", async () => {
    const created = await createExactComparison();
    const context = { params: Promise.resolve({ comparisonId: created.id }) };
    const first = await updateComparison(request(`/api/comparisons/${created.id}`, "PATCH", { expectedVersion: 0, stage: "evidence_lens" }), context);
    expect(first.status).toBe(200);
    const stale = await updateComparison(request(`/api/comparisons/${created.id}`, "PATCH", { expectedVersion: 0, stage: "identity_bridge" }), context);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("VERSION_CONFLICT");
  });

  it("returns a safe validation envelope for malformed input", async () => {
    const response = await createComparison(request("/api/comparisons", "POST", { targetListingId: "x" }), undefined);
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.requestId).toBe("integration-test");
  });

  it("distinguishes invalid JSON from schema validation", async () => {
    const response = await createComparison(
      new Request("http://sameproof.test/api/comparisons", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-request-id": "invalid-json-test",
        },
        body: "{not-json",
      }),
      undefined,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_REQUEST");
  });

  it("deletes the comparison and its issued public passport", async () => {
    const created = await createExactComparison();
    const context = { params: Promise.resolve({ comparisonId: created.id }) };
    const patchResponse = await updateComparison(request(`/api/comparisons/${created.id}`, "PATCH", {
      expectedVersion: created.version,
      stage: "identity_bridge",
      evidence: confirmEvidence(created),
      evidenceConfirmed: true,
    }), context);
    expect(patchResponse.status).toBe(200);

    expect((await evaluateComparison(request(`/api/comparisons/${created.id}/evaluate`, "POST", {}), context)).status).toBe(200);
    const passportResponse = await createPassport(request(`/api/comparisons/${created.id}/passport`, "POST", {}), context);
    const issued = await passportResponse.json();

    const deleteResponse = await deleteComparison(request(`/api/comparisons/${created.id}`, "DELETE"), context);
    expect(deleteResponse.status).toBe(200);
    expect((await deleteResponse.json()).deleted).toBe(true);
    expect((await getComparison(request(`/api/comparisons/${created.id}`, "GET"), context)).status).toBe(404);
    expect((await getPublicPassport(request(`/api/passports/${issued.publicToken}`, "GET"), { params: Promise.resolve({ publicToken: issued.publicToken }) })).status).toBe(404);
  });
});
