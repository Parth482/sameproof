import "server-only";

import { MongoClient, ServerApiVersion } from "mongodb";
import { AppError } from "@/lib/errors/app-error";

declare global {
  var sameProofMongoClientPromise: Promise<MongoClient> | undefined;
}

export function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new AppError(
      "DATABASE_UNAVAILABLE",
      "MongoDB Atlas is not configured.",
      503,
    );
  }

  if (!globalThis.sameProofMongoClientPromise) {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      maxPoolSize: 10,
      minPoolSize: 0,
      connectTimeoutMS: 10_000,
      serverSelectionTimeoutMS: 10_000,
    });
    globalThis.sameProofMongoClientPromise = client.connect().catch((cause) => {
      globalThis.sameProofMongoClientPromise = undefined;
      throw new AppError(
        "DATABASE_UNAVAILABLE",
        "MongoDB Atlas could not be reached. Try again shortly.",
        503,
        undefined,
        cause instanceof Error ? { cause } : undefined,
      );
    });
  }

  return globalThis.sameProofMongoClientPromise;
}

export async function getDatabase() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB_NAME ?? "sameproof");
}
