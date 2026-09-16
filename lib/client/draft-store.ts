import { openDB } from "idb";
import type { CatalogueData, Comparison, Decision, DemoScenario } from "@/models/domain";

const DATABASE_NAME = "sameproof-drafts";
const STORE_NAME = "comparisons";
const CATALOGUE_STORE = "catalogue";
const DECISION_STORE = "decisions";

function database() {
  return openDB(DATABASE_NAME, 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(CATALOGUE_STORE)) db.createObjectStore(CATALOGUE_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(DECISION_STORE)) db.createObjectStore(DECISION_STORE, { keyPath: "comparisonId" });
    },
  });
}

export async function saveDraft(comparison: Comparison): Promise<void> {
  const db = await database();
  await db.put(STORE_NAME, comparison);
}

export async function getDraft(id: string): Promise<Comparison | undefined> {
  const db = await database();
  return db.get(STORE_NAME, id);
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await database();
  await Promise.all([db.delete(STORE_NAME, id), db.delete(DECISION_STORE, id)]);
}

export interface CatalogueDraft {
  catalogue: CatalogueData;
  scenarios: DemoScenario[];
  mode: "demo" | "atlas";
}

export async function saveCatalogueDraft(value: CatalogueDraft): Promise<void> {
  const db = await database();
  await db.put(CATALOGUE_STORE, { id: "current", ...value });
}

export async function getCatalogueDraft(): Promise<CatalogueDraft | undefined> {
  const db = await database();
  const value = await db.get(CATALOGUE_STORE, "current");
  if (!value) return undefined;
  const { id: _id, ...catalogue } = value;
  void _id;
  return catalogue as CatalogueDraft;
}

export async function saveDecisionDraft(decision: Decision): Promise<void> {
  const db = await database();
  await db.put(DECISION_STORE, decision);
}

export async function getDecisionDraft(comparisonId: string): Promise<Decision | undefined> {
  const db = await database();
  return db.get(DECISION_STORE, comparisonId);
}
