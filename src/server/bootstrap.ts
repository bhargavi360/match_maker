import "server-only";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { bootstrapSchema, defaultWeights, weightsSchema } from "@/domain/validation";
import { db } from "./db";
import { AppError } from "./errors";
export async function setupAvailable() {
  const state = await db().systemState.findUnique({ where: { id: 1 } });
  return !state?.bootstrapCompleted;
}
export async function bootstrap(input: unknown) {
  const data = bootstrapSchema.parse(input);
  const configured = process.env.MATCHMAKER_SETUP_TOKEN;
  if (!configured || !/^[a-f0-9]{64,128}$/.test(configured)) throw new AppError(503, "The operator must configure a high-entropy setup token before setup.");
  const actual = Buffer.from(data.token);
  const expected = Buffer.from(configured);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new AppError(403, "Setup could not be authorized.");
  const password = await hashPassword(data.password);
  await db().$transaction(async tx => {
    const latch = await tx.systemState.updateMany({ where: { id: 1, bootstrapCompleted: false }, data: { bootstrapCompleted: true } });
    if (latch.count !== 1) throw new AppError(409, "One-time setup is permanently closed.");
    const id = randomUUID();
    await tx.user.create({ data: { id, slot: 1, role: "USER", name: data.name, email: data.email, emailVerified: false } });
    await tx.account.create({ data: { id: randomUUID(), userId: id, accountId: id, providerId: "credential", password } });
    await tx.appSettings.create({ data: { ownerId: id, weights: weightsSchema.parse(defaultWeights) } });
    await tx.auditEvent.create({ data: { action: "BOOTSTRAP_COMPLETED", actorId: id, fields: [] } });
    await tx.auditEvent.create({ data: { action: "SETTINGS_INITIALIZED", actorId: id, fields: ["weights", "version"] } });
  }, { timeout: 15000 });
}
