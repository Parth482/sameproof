import { z } from "zod";

const id = z.string().trim().min(1).max(120);
const constraint = z.enum([
  "exact_identity",
  "new_condition",
  "manufacturer_warranty",
  "same_bundle",
  "delivery",
  "pickup",
  "lowest_total",
  "fresh_evidence",
]);
const evidenceKey = z.enum([
  "manufacturerModel", "normalizedModel", "gtin", "regionalSuffix",
  "priceCents", "deliveryCostCents", "sellerName", "sellerType",
  "retailerId", "stockState", "membershipRequired", "condition",
  "warrantyMonths", "bundleItems", "observedAt",
]);

const contextSchema = z.object({
  postcode: z.string().regex(/^\d{4}$/, "Enter a four-digit Australian postcode.").optional(),
  fulfilment: z.enum(["delivery", "pickup"]),
  mustHave: z.array(constraint).max(8),
  flexible: z.array(constraint).max(8),
}).superRefine((context, issue) => {
  const repeated = context.mustHave.filter((item) => context.flexible.includes(item));
  if (repeated.length) issue.addIssue({ code: "custom", message: "A requirement cannot be both must-have and flexible." });
  if (new Set(context.mustHave).size !== context.mustHave.length || new Set(context.flexible).size !== context.flexible.length) {
    issue.addIssue({ code: "custom", message: "Requirements must not be duplicated." });
  }
});

export const createComparisonSchema = z.object({
  targetListingId: id,
  competitorListingId: id,
  context: contextSchema,
});

const evidenceSourceSchema = z.object({
  type: z.enum(["dataset", "url", "barcode", "image", "manual"]),
  reference: z.string().max(2_048).optional(),
  observedAt: z.iso.datetime().optional(),
});

const evidenceFieldSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
  state: z.enum(["confirmed", "unconfirmed", "unknown", "conflicting"]),
  sources: z.array(evidenceSourceSchema).max(10),
  confidence: z.enum(["high", "medium", "low"]).optional(),
  userConfirmed: z.boolean(),
});

export const updateComparisonSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    stage: z
      .enum(["offer_dock", "evidence_lens", "identity_bridge", "near_miss", "passport"])
      .optional(),
    targetListingId: id.optional(),
    competitorListingId: id.optional(),
    targetObservationId: id.optional(),
    competitorObservationId: id.optional(),
    evidence: z
      .object({
        target: z.partialRecord(evidenceKey, evidenceFieldSchema),
        competitor: z.partialRecord(evidenceKey, evidenceFieldSchema),
      })
      .optional(),
    evidenceConfirmed: z.boolean().optional(),
    context: contextSchema.optional(),
  })
  .strict();

export const comparisonIdSchema = z.uuid();
export const publicTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);
