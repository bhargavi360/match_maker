import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";
// A server-only caller can compose a confirmed chat change with its receipt.
// HTTP JSON cannot supply a transaction; ordinary domain calls retain their transaction.
export function inTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>, existing?: Prisma.TransactionClient): Promise<T> {
  return existing ? work(existing) : db().$transaction(work);
}
