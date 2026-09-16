import { NextResponse } from "next/server";

import { getRepository } from "@/lib/database";
import { withRouteErrors } from "@/lib/errors/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRouteErrors(async () => {
  const repository = await getRepository();
  const [catalogue, scenarios] = await Promise.all([
    repository.getCatalogue(),
    repository.getScenarios(),
  ]);
  return NextResponse.json(
    { catalogue, scenarios, mode: repository.mode },
    { headers: { "Cache-Control": "no-store" } },
  );
});
