import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
import { appOrigin } from "./config";
import { AppError } from "./errors";
import { userRoleSchema } from "@/domain/validation";
function createAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith("replace-")) throw new AppError(503, "Authentication configuration is unavailable. Ask the operator to configure this workspace.");
  return betterAuth({
    appName: "Matchmaker", secret, baseURL: appOrigin(), basePath: "/api/auth",
    database: prismaAdapter(db(), { provider: "sqlite", transaction: true }),
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 43200, updateAge: 1800, cookieCache: { enabled: false } },
    advanced: {
      useSecureCookies: appOrigin().startsWith("https:"),
      defaultCookieAttributes: { httpOnly: true, sameSite: "strict", secure: appOrigin().startsWith("https:") },
      ipAddress: { disableIpTracking: true },
    },
    databaseHooks: { session: { create: { before: async session => ({ data: { ...session, ipAddress: null, userAgent: null } }) } } },
    trustedOrigins: [appOrigin()],
    rateLimit: { enabled: false },
    logger: { disabled: true },
    telemetry: { enabled: false },
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function auth() { return instance ??= createAuth(); }
export async function requireMatchmaker(headers: Headers) {
  const session = await auth().api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session) throw new AppError(401, "Please sign in to continue.");
  const [user, state] = await Promise.all([db().user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, role: true } }), db().systemState.findUnique({ where: { id: 1 } })]);
  if (!user || !state?.bootstrapCompleted) throw new AppError(401, "Please sign in to continue.");
  if (state?.maintenance) throw new AppError(503, "Workspace maintenance is in progress.");
  return { id: user.id, name: user.name, role: userRoleSchema.parse(user.role) };
}
