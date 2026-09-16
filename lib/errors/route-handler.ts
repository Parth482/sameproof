import { NextResponse } from "next/server";

import { normalizeError } from "@/lib/errors/app-error";

type RouteHandler<Context = unknown> = (
  request: Request,
  context: Context,
) => Promise<Response>;

export function withRouteErrors<Context>(
  handler: RouteHandler<Context>,
): RouteHandler<Context> {
  return async (request, context) => {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    try {
      const response = await handler(request, context);
      response.headers.set("x-request-id", requestId);
      return response;
    } catch (caught) {
      const error = normalizeError(caught);

      console.error(
        JSON.stringify({
          level: "error",
          requestId,
          method: request.method,
          path: new URL(request.url).pathname,
          code: error.code,
          message: error.message,
          cause: error.cause instanceof Error ? error.cause.message : undefined,
        }),
      );

      return NextResponse.json(
        {
          error: {
            code: error.code,
            message: error.message,
            details: error.status < 500 ? error.details : undefined,
            requestId,
          },
        },
        { status: error.status, headers: { "x-request-id": requestId } },
      );
    }
  };
}
