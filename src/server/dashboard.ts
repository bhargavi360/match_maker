import "server-only";
import { db } from "./db";
import { requireMatchmaker } from "./auth";
export async function getDashboard(headers: Headers) {
  const actor = await requireMatchmaker(headers);
  const active = { ownerId: actor.id, status: "ACTIVE" };
  const [total, real, demo, recent, archived, incomplete, granted, withdrawn, activity] = await Promise.all([
    db().profile.count({ where: active }), db().profile.count({ where: { ...active, kind: "REAL" } }), db().profile.count({ where: { ...active, kind: "DEMO" } }),
    db().profile.count({ where: { ownerId: actor.id, createdAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
    db().profile.count({ where: { ownerId: actor.id, status: "ARCHIVED" } }),
    db().profile.count({ where: { ...active, OR: [{ reportedAge: null }, { city: null }, { occupation: null }] } }),
    db().profileConsent.count({ where: { status: "GRANTED", profile: active } }),
    db().profileConsent.count({ where: { status: "WITHDRAWN", profile: active } }),
    db().auditEvent.findMany({ where: { actorId: actor.id }, take: 8, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true, action: true, createdAt: true } }),
  ]);
  return { active: total, real, demo, recent, archived, incomplete, granted, withdrawn, unset: total * 5 - granted - withdrawn, activity: activity.map(a => ({ ...a, createdAt: a.createdAt.toISOString() })) };
}
export async function getSettings(headers: Headers) {
  const actor = await requireMatchmaker(headers);
  return db().appSettings.findUnique({ where: { ownerId: actor.id }, select: { version: true, weights: true } });
}
