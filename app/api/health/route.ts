import { NextResponse } from "next/server";

import { getRepository } from "@/lib/database";
import { withRouteErrors } from "@/lib/errors/route-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withRouteErrors(async () => {
  const repository = await getRepository();
  await repository.getCatalogue();
  return NextResponse.json({ status: "ok", databaseMode: repository.mode });
});
