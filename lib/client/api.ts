import type {
  CatalogueData,
  Comparison,
  Decision,
  DemoScenario,
  PriceMatchPassport,
} from "@/models/domain";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly requestId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (cause) {
    throw new ApiClientError(
      "The network is unavailable. Your saved draft can still be recovered on this device.",
      "NETWORK_UNAVAILABLE",
      0,
      undefined,
      cause instanceof Error ? { cause: cause.message } : undefined,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string; requestId?: string; details?: Record<string, unknown> } }
    | T
    | null;
  if (!response.ok) {
    const apiError = payload && typeof payload === "object" && "error" in payload ? payload.error : undefined;
    throw new ApiClientError(
      apiError?.message ?? "The request could not be completed.",
      apiError?.code ?? "REQUEST_FAILED",
      response.status,
      apiError?.requestId,
      apiError?.details,
    );
  }
  return payload as T;
}

export type CatalogueResponse = {
  catalogue: CatalogueData;
  scenarios: DemoScenario[];
  mode: "demo" | "atlas";
};

export function getCatalogue() {
  return requestJson<CatalogueResponse>("/api/catalogue", { cache: "no-store" });
}

export function createComparison(input: {
  targetListingId: string;
  competitorListingId: string;
  context: Comparison["context"];
}) {
  return requestJson<{ comparison: Comparison; mode: "demo" | "atlas" }>(
    "/api/comparisons",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function getComparison(id: string) {
  return requestJson<{
    comparison: Comparison;
    decision: Decision | null;
    mode: "demo" | "atlas";
  }>(`/api/comparisons/${id}`, { cache: "no-store" });
}

export function updateComparison(
  id: string,
  input: {
    expectedVersion: number;
    stage?: Comparison["stage"];
    targetListingId?: string;
    competitorListingId?: string;
    targetObservationId?: string;
    competitorObservationId?: string;
    evidence?: Comparison["evidence"];
    evidenceConfirmed?: boolean;
    context?: Comparison["context"];
  },
) {
  return requestJson<{ comparison: Comparison; mode: "demo" | "atlas" }>(
    `/api/comparisons/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function deleteComparison(id: string) {
  return requestJson<{ deleted: true }>(`/api/comparisons/${id}`, { method: "DELETE" });
}

export function evaluateComparison(id: string) {
  return requestJson<{ comparison: Comparison; decision: Decision }>(
    `/api/comparisons/${id}/evaluate`,
    { method: "POST", body: "{}" },
  );
}

export function applyNearMiss(
  id: string,
  input: { suggestionId: string; expectedVersion: number },
) {
  return requestJson<{ comparison: Comparison }>(
    `/api/comparisons/${id}/near-miss`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export type PublicPassport = Omit<PriceMatchPassport, "publicTokenHash">;

export function createPassport(id: string) {
  return requestJson<{
    passport: PublicPassport;
    publicToken: string;
    sharePath: string;
  }>(`/api/comparisons/${id}/passport`, { method: "POST", body: "{}" });
}

export function getPublicPassport(token: string) {
  return requestJson<{ passport: PublicPassport }>(`/api/passports/${token}`, {
    cache: "no-store",
  });
}
