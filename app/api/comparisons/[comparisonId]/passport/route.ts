import { NextResponse } from "next/server";

import { resolveComparisonDependencies } from "@/lib/database/repository";
import { ValidationError } from "@/lib/errors/app-error";
import { withRouteErrors } from "@/lib/errors/route-handler";
import { generatePassport } from "@/lib/passport-engine";
import { getComparisonOrThrow } from "@/lib/server/comparison-service";
import { comparisonIdSchema } from "@/lib/validation/comparison";
import { assertRateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

type Context = { params: Promise<{ comparisonId: string }> };

function generatePublicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export const POST = withRouteErrors<Context>(async (request, context) => {
  assertRateLimit(request, "passport-create", 10);
  const { comparisonId: rawId } = await context.params;
  const comparisonId = comparisonIdSchema.parse(rawId);
  const { repository, comparison } = await getComparisonOrThrow(comparisonId);
  const decision = await repository.getLatestDecision(comparisonId);
  if (!decision) throw new ValidationError("Evaluate the comparison first.");
  if (decision.comparisonVersion !== comparison.version) {
    throw new ValidationError("Re-evaluate the updated comparison before creating a passport.");
  }

  const catalogue = await repository.getCatalogue();
  const dependencies = resolveComparisonDependencies(
    catalogue,
    comparison.targetListingId!,
    comparison.competitorListingId!,
    comparison.targetObservationId,
    comparison.competitorObservationId,
  );
  if (!dependencies) throw new ValidationError("Policy evidence is unavailable.");

  const rawToken = generatePublicToken();
  const passport = await generatePassport(
    comparison,
    decision,
    dependencies.policy,
    rawToken,
  );
  await repository.savePassport(passport);
  const { publicTokenHash: _secretHash, ...publicPassport } = passport;
  void _secretHash;
  return NextResponse.json(
    {
      passport: publicPassport,
      publicToken: rawToken,
      sharePath: `/p/${rawToken}`,
    },
    { status: 201 },
  );
});
