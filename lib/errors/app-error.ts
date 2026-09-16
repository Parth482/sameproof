import { ZodError } from "zod";

export type ErrorCode =
  | "INVALID_REQUEST"
  | "VALIDATION_FAILED"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "EXPIRED_RESOURCE"
  | "DATABASE_UNAVAILABLE"
  | "POLICY_CONFIGURATION_INVALID"
  | "INVARIANT_VIOLATION"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, options?: ErrorOptions) {
    super("VALIDATION_FAILED", message, 422, details, options);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super("NOT_FOUND", `${resource} was not found.`, 404);
  }
}

export class VersionConflictError extends AppError {
  constructor() {
    super(
      "VERSION_CONFLICT",
      "This comparison changed in another tab. Refresh before trying again.",
      409,
    );
  }
}

export class ExpiredResourceError extends AppError {
  constructor(resource: string) {
    super("EXPIRED_RESOURCE", `${resource} has expired.`, 410);
  }
}

export function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new ValidationError("Some submitted values need correction.", {
      fieldErrors: error.flatten().fieldErrors,
    });
  }

  if (error instanceof SyntaxError) {
    return new AppError(
      "INVALID_REQUEST",
      "The request body is not valid JSON.",
      400,
    );
  }

  return new AppError(
    "INTERNAL_ERROR",
    "Something went wrong while processing the request.",
    500,
    undefined,
    error instanceof Error ? { cause: error } : undefined,
  );
}
