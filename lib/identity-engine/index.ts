import { listsEqual, normalizeModel } from "@/lib/domain/normalization";
import { trustedEvidenceValue } from "@/lib/domain/evidence";
import type {
  EvidenceSourceType,
  EvidenceRecord,
  ProductIdentity,
  RetailerListing,
  RuleOutcome,
} from "@/models/domain";

function outcome(
  code: string,
  label: string,
  result: RuleOutcome["result"],
  explanation: string,
  values: unknown[],
  sourceTypes: EvidenceSourceType[] = ["dataset"],
): RuleOutcome {
  return {
    code,
    label,
    result,
    classification: "required",
    explanation,
    evidence: values.map((value, index) => ({
      field: index === 0 ? "target" : "competitor",
      value,
      sourceTypes,
    })),
  };
}

function compareRequired(
  code: string,
  label: string,
  target: unknown,
  competitor: unknown,
  formatter: (value: unknown) => unknown = (value) => value,
  sourceTypes: EvidenceSourceType[] = ["dataset"],
): RuleOutcome {
  if (target === undefined || target === null || competitor === undefined || competitor === null) {
    return outcome(
      code,
      label,
      "unknown",
      `${label} cannot be confirmed because one or both values are missing.`,
      [target ?? "Unknown", competitor ?? "Unknown"],
      sourceTypes,
    );
  }

  const targetValue = formatter(target);
  const competitorValue = formatter(competitor);
  const result = targetValue === competitorValue ? "pass" : "fail";
  return outcome(
    code,
    label,
    result,
    result === "pass"
      ? `${label} matches across both offers.`
      : `${label} differs, so the offers are not commercially identical.`,
    [target, competitor],
    sourceTypes,
  );
}

export interface IdentityEvaluation {
  status: "exact" | "conflict" | "unknown";
  commercialChecks: RuleOutcome[];
  functionalComparison: RuleOutcome[];
}

/**
 * Compares strict commercial identity separately from functional similarity.
 * Functional similarities never override a failed identifier check.
 */
export function evaluateIdentity(
  targetListing: RetailerListing,
  competitorListing: RetailerListing,
  targetProduct?: ProductIdentity,
  competitorProduct?: ProductIdentity,
  evidence?: { target: EvidenceRecord; competitor: EvidenceRecord },
): IdentityEvaluation {
  const evidenceValue = (
    side: "target" | "competitor",
    key: keyof EvidenceRecord,
    fallback: unknown,
  ) => {
    if (!evidence) return fallback;
    const captured = evidence?.[side][key];
    if (!captured) return null;
    return trustedEvidenceValue(evidence[side], key);
  };
  const evidenceSources = (key: keyof EvidenceRecord) => [
    ...new Set(
      [
        ...(evidence?.target[key]?.sources ?? []),
        ...(evidence?.competitor[key]?.sources ?? []),
      ].map((source) => source.type),
    ),
  ];
  const commercialChecks: RuleOutcome[] = [
    compareRequired(
      "IDENTITY_MODEL",
      "Manufacturer model",
      evidenceValue(
        "target",
        "manufacturerModel",
        targetListing.listedModel ?? targetProduct?.identifiers.manufacturerModel,
      ),
      evidenceValue(
        "competitor",
        "manufacturerModel",
        competitorListing.listedModel ?? competitorProduct?.identifiers.manufacturerModel,
      ),
      (value) => normalizeModel(String(value)),
      evidenceSources("manufacturerModel"),
    ),
    compareRequired(
      "IDENTITY_GTIN",
      "GTIN",
      evidenceValue(
        "target",
        "gtin",
        targetListing.listedGtin ?? targetProduct?.identifiers.gtin,
      ),
      evidenceValue(
        "competitor",
        "gtin",
        competitorListing.listedGtin ?? competitorProduct?.identifiers.gtin,
      ),
      undefined,
      evidenceSources("gtin"),
    ),
    compareRequired(
      "IDENTITY_REGION",
      "Regional suffix",
      evidenceValue("target", "regionalSuffix", targetProduct?.identifiers.regionalSuffix),
      evidenceValue(
        "competitor",
        "regionalSuffix",
        competitorProduct?.identifiers.regionalSuffix,
      ),
      (value) => String(value).toUpperCase(),
      evidenceSources("regionalSuffix"),
    ),
    compareRequired(
      "IDENTITY_CONDITION",
      "Condition",
      evidenceValue("target", "condition", targetListing.condition),
      evidenceValue("competitor", "condition", competitorListing.condition),
      undefined,
      evidenceSources("condition"),
    ),
    compareRequired(
      "IDENTITY_WARRANTY",
      "Warranty period",
      evidenceValue(
        "target",
        "warrantyMonths",
        targetListing.warrantyMonths ??
          targetProduct?.commercialAttributes.manufacturerWarrantyMonths,
      ),
      evidenceValue(
        "competitor",
        "warrantyMonths",
        competitorListing.warrantyMonths ??
          competitorProduct?.commercialAttributes.manufacturerWarrantyMonths,
      ),
      undefined,
      evidenceSources("warrantyMonths"),
    ),
    compareRequired(
      "IDENTITY_BUNDLE",
      "Promotional bundle",
      evidenceValue("target", "bundleItems", targetListing.promotionalBundleItems),
      evidenceValue("competitor", "bundleItems", competitorListing.promotionalBundleItems),
      (value) => Array.isArray(value) ? [...value].map(String).sort().join("\u0000") : value,
      evidenceSources("bundleItems"),
    ),
  ];

  const specificationPairs: Array<{
    code: string;
    label: string;
    target: unknown;
    competitor: unknown;
    compare?: (left: unknown, right: unknown) => boolean;
  }> = [
    {
      code: "SPEC_SIZE",
      label: "Screen size",
      target: targetProduct?.specifications.screenSizeInches,
      competitor: competitorProduct?.specifications.screenSizeInches,
    },
    {
      code: "SPEC_RESOLUTION",
      label: "Resolution",
      target: targetProduct?.specifications.resolution,
      competitor: competitorProduct?.specifications.resolution,
    },
    {
      code: "SPEC_PANEL",
      label: "Panel technology",
      target: targetProduct?.specifications.panelTechnology,
      competitor: competitorProduct?.specifications.panelTechnology,
    },
    {
      code: "SPEC_REFRESH_RATE",
      label: "Refresh rate",
      target: targetProduct?.specifications.refreshRateHz,
      competitor: competitorProduct?.specifications.refreshRateHz,
    },
    {
      code: "SPEC_PORTS",
      label: "Ports",
      target: targetProduct?.specifications.ports,
      competitor: competitorProduct?.specifications.ports,
      compare: (left, right) => listsEqual(left as string[], right as string[]),
    },
    {
      code: "SPEC_STAND",
      label: "Stand features",
      target: targetProduct?.specifications.standFeatures,
      competitor: competitorProduct?.specifications.standFeatures,
      compare: (left, right) => listsEqual(left as string[], right as string[]),
    },
  ];

  const functionalComparison = specificationPairs.map((pair) => {
    if (pair.target === undefined || pair.competitor === undefined) {
      return outcome(
        pair.code,
        pair.label,
        "unknown",
        `${pair.label} is not available for both products.`,
        [pair.target ?? "Unknown", pair.competitor ?? "Unknown"],
      );
    }
    const matches = pair.compare
      ? pair.compare(pair.target, pair.competitor)
      : pair.target === pair.competitor;
    const result = matches ? "pass" : "fail";
    return outcome(
      pair.code,
      pair.label,
      result,
      matches
        ? `${pair.label} is functionally equivalent.`
        : `${pair.label} differs functionally.`,
      [pair.target, pair.competitor],
    );
  });

  const status = commercialChecks.some((check) => check.result === "fail")
    ? "conflict"
    : commercialChecks.some((check) => check.result === "unknown")
      ? "unknown"
      : "exact";

  return { status, commercialChecks, functionalComparison };
}
