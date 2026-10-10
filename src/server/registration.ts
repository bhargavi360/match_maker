import "server-only";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { defaultWeights, registrationSchema, weightsSchema } from "@/domain/validation";
import { db } from "./db";
import { AppError } from "./errors";

export async function registerAccount(input: unknown) {
  const data = registrationSchema.parse(input);
  const state = await db().systemState.findUnique({ where: { id: 1 }, select: { bootstrapCompleted: true } });
  if (!state?.bootstrapCompleted) throw new AppError(503, "Workspace setup is not complete. Ask the operator to initialize it first.");
  const password = await hashPassword(data.password);
  const id = randomUUID();

  try {
    await db().$transaction(async tx => {
      const existing = await tx.user.findUnique({ where: { email: data.email }, select: { id: true } });
      if (existing) throw new AppError(409, "An account already exists for this email.");
      const highestSlot = await tx.user.aggregate({ _max: { slot: true } });
      await tx.user.create({ data: { id, slot: (highestSlot._max.slot ?? 0) + 1, role: "USER", name: data.name, email: data.email, emailVerified: false } });
      await tx.account.create({ data: { id: randomUUID(), userId: id, accountId: id, providerId: "credential", password } });
      await tx.appSettings.create({ data: { ownerId: id, weights: weightsSchema.parse(defaultWeights) } });
      await tx.auditEvent.create({ data: { action: "ACCOUNT_REGISTERED", actorId: id, fields: [] } });
    }, { timeout: 15000 });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new AppError(409, "An account already exists for this email.");
    throw error;
  }
}
