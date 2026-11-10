import { betterAuth } from "better-auth";

export function createAuth(env, request) {
  if (!env.DB || !env.BETTER_AUTH_SECRET) return null;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL || new URL(request.url).origin,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128
    },
    advanced: {
      database: { generateId: "uuid" },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: new URL(request.url).protocol === "https:"
      }
    }
  });
}
