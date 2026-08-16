import { env } from "../config/env.js";
import { getUserFromSessionToken } from "../services/authService.js";
import { AppError } from "../utils/AppError.js";

function getBearerToken(req) {
  const header = req.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

export function getRequestSessionToken(req) {
  return req.cookies?.[env.sessionCookieName] || getBearerToken(req);
}

export async function optionalAuth(req, _res, next) {
  try {
    const token = getRequestSessionToken(req);
    const session = await getUserFromSessionToken(token);
    req.user = session?.user || null;
    req.sessionToken = token || null;
    next();
  } catch (error) {
    if (error.code === "DATABASE_NOT_CONFIGURED") {
      req.user = null;
      req.sessionToken = null;
      next();
      return;
    }
    next(error);
  }
}

export async function requireAuth(req, _res, next) {
  try {
    const token = getRequestSessionToken(req);
    const session = await getUserFromSessionToken(token);
    if (!session?.user) {
      throw new AppError("UNAUTHENTICATED", "Sessão inválida ou expirada.", 401);
    }
    req.user = session.user;
    req.sessionToken = token;
    next();
  } catch (error) {
    next(error);
  }
}
