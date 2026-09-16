import "server-only";

import type { SameProofRepository } from "@/lib/database/repository";
import { AppError } from "@/lib/errors/app-error";

let repositoryPromise: Promise<SameProofRepository> | undefined;

export function getRepository(): Promise<SameProofRepository> {
  if (!repositoryPromise) {
    repositoryPromise = (async () => {
      if (process.env.MONGODB_URI) {
        const { MongoRepository } = await import("@/lib/database/mongo-repository");
        return new MongoRepository();
      }
      if (process.env.SAMEPROOF_DEMO_MODE === "false") {
        throw new AppError(
          "DATABASE_UNAVAILABLE",
          "MongoDB Atlas is required when demo mode is disabled.",
          503,
        );
      }
      const { MemoryRepository } = await import("@/lib/database/memory-repository");
      return new MemoryRepository();
    })();
  }
  return repositoryPromise;
}
