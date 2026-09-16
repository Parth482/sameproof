import { NextResponse } from "next/server";

import { getRepository } from "@/lib/database";
import { ExpiredResourceError, NotFoundError } from "@/lib/errors/app-error";
import { withRouteErrors } from "@/lib/errors/route-handler";
import { sha256 } from "@/lib/passport-engine";
import { publicTokenSchema } from "@/lib/validation/comparison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ publicToken: string }> };

export const GET = withRouteErrors<Context>(async (_request, context) => {
  const { publicToken: rawToken } = await context.params;
  const publicToken = publicTokenSchema.parse(rawToken);
  const repository = await getRepository();
  const passport = await repository.getPassportByTokenHash(await sha256(publicToken));
  if (!passport) throw new NotFoundError("Passport");
  if (passport.revokedAt) throw new NotFoundError("Passport");
  if (Date.parse(passport.expiresAt) <= Date.now()) {
    throw new ExpiredResourceError("Passport");
  }
  const { publicTokenHash: _secretHash, ...publicPassport } = passport;
  void _secretHash;
  return NextResponse.json(
    { passport: publicPassport },
    { headers: { "Cache-Control": "private, no-store" } },
  );
});
