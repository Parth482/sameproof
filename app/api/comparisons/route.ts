import { NextResponse } from "next/server";

import { getRepository } from "@/lib/database";
import { resolveComparisonDependencies } from "@/lib/database/repository";
import { ValidationError } from "@/lib/errors/app-error";
import { withRouteErrors } from "@/lib/errors/route-handler";
import { createComparisonSchema } from "@/lib/validation/comparison";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

export const POST = withRouteErrors(async (request: Request) => {
  assertRateLimit(request, "comparison-create", 20);
  const input = createComparisonSchema.parse(await request.json());
  if (input.targetListingId === input.competitorListingId) {
    throw new ValidationError("Choose two different retailer listings.");
  }

  const repository = await getRepository();
  const catalogue = await repository.getCatalogue();
  const dependencies = resolveComparisonDependencies(
    catalogue,
    input.targetListingId,
    input.competitorListingId,
  );
  if (!dependencies) {
    throw new ValidationError("One of the selected offers has no usable observation.");
  }
  if (dependencies.targetRetailer.kind !== "retailer") {
    throw new ValidationError("The target offer must belong to a supported policy retailer.");
  }

  const comparison = await repository.createComparison(input);
  return NextResponse.json(
    { comparison, mode: repository.mode },
    { status: 201 },
  );
});
