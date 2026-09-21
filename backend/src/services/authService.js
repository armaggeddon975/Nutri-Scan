import { env, isProduction } from "../config/env.js";
import { withTransaction } from "../database/pool.js";
import {
  createUser,
  findUserByEmailOrNameKey,
  findUserConflict,
  findUserById,
  getUserAllergies,
  replaceUserAllergies,
} from "../repositories/userRepository.js";
import {
  createSession,
  deleteExpiredSessions,
  deleteSessionByTokenHash,
  findSessionByTokenHash,
  touchSession,
} from "../repositories/sessionRepository.js";
import { AppError } from "../utils/AppError.js";
import { normalizeEmail, toPublicUser } from "../utils/normalize.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import {
  generateId,
  generateSessionToken,
  getSessionExpiration,
  hashSessionToken,
} from "../utils/sessionToken.js";
import { validateLogin, validateRegister } from "../utils/validation.js";

const EXPIRED_SESSION_CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastExpiredSessionCleanupAt = 0;

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: env.sessionTtlDays * 24 * 60 * 60 * 1000,
  };
}

export function clearSessionCookie(res) {
  res.clearCookie(env.sessionCookieName, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
  });
}

export function setSessionCookie(res, token) {
  res.cookie(env.sessionCookieName, token, getSessionCookieOptions());
}

async function createSessionForUser(userId, client) {
  const token = generateSessionToken();
  await createSession(
    {
      id: generateId(),
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt: getSessionExpiration(env.sessionTtlDays),
    },
    client,
  );
  return token;
}

async function cleanupExpiredSessionsOccasionally() {
  const now = Date.now();
  if (now - lastExpiredSessionCleanupAt < EXPIRED_SESSION_CLEANUP_INTERVAL_MS) return;
  lastExpiredSessionCleanupAt = now;

  try {
    await deleteExpiredSessions();
  } catch {
    // Limpeza global e manutencao; uma falha aqui nao deve invalidar uma sessao atual.
  }
}

export async function registerUser(input) {
  const data = validateRegister(input);

  return withTransaction(async (client) => {
    // UNICIDADE DE NOME DE USUARIO (documentado na v0.7.4, achado N2)
    //
    // `findUserConflict` recusa tanto e-mail repetido quanto NOME repetido.
    // Consequencia pratica: duas pessoas chamadas "Joao Silva" nao conseguem
    // ter conta.
    //
    // A regra nao e arbitraria - ela sustenta o login. `loginUser` aceita
    // e-mail OU nome como identificador, e a consulta termina em `LIMIT 1`. Com
    // nomes repetidos, entrar por nome escolheria uma conta qualquer entre as
    // homonimas: um defeito de autenticacao, nao de conveniencia.
    //
    // Ou seja, retirar a unicidade de nome exige antes retirar o login por
    // nome. As duas coisas andam juntas.
    //
    // A MENSAGEM NAO DIZ QUAL CAMPO COLIDIU
    //
    // O efeito e limitar enumeracao de contas: quem recebe 409 sabe que um dos
    // dois ja existe, mas nao qual. Dizer "esse e-mail ja tem conta" permitiria
    // testar uma lista de e-mails e descobrir quem e usuario do app.
    //
    // Registro honesto: esse efeito e real, mas NAO ha registro de que tenha
    // sido a intencao original - nem em comentario, nem em CHANGELOG. Este
    // comentario documenta o motivo de manter, nao uma intencao que eu possa
    // comprovar.
    const conflict = await findUserConflict(data.email, data.nameKey, client);
    if (conflict) {
      throw new AppError("ACCOUNT_EXISTS", "Já existe uma conta com esse e-mail ou usuário.", 409);
    }

    const password = await hashPassword(data.password);
    const user = await createUser(
      {
        id: generateId(),
        name: data.name,
        nameKey: data.nameKey,
        email: data.email,
        passwordHash: password.hash,
        passwordSalt: password.salt,
      },
      client,
    );
    const allergies = await replaceUserAllergies(user.id, data.allergies, client);
    const token = await createSessionForUser(user.id, client);

    return { user: toPublicUser(user, allergies), token };
  });
}

export async function loginUser(input) {
  const data = validateLogin(input);
  const identifier = normalizeEmail(data.identifier);
  const user = await findUserByEmailOrNameKey(identifier, data.identifierKey);
  const valid = user
    ? await verifyPassword(data.password, user.password_salt, user.password_hash)
    : false;

  if (!user || !valid) {
    throw new AppError(
      "INVALID_CREDENTIALS",
      "Usuário, e-mail ou senha inválidos.",
      401,
    );
  }

  return withTransaction(async (client) => {
    const allergies = await getUserAllergies(user.id, client);
    const token = await createSessionForUser(user.id, client);
    return { user: toPublicUser(user, allergies), token };
  });
}

export async function getUserFromSessionToken(token) {
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const session = await findSessionByTokenHash(tokenHash);
  if (!session) return null;

  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await deleteSessionByTokenHash(tokenHash);
    return null;
  }

  cleanupExpiredSessionsOccasionally();

  try {
    await touchSession(session.id);
  } catch {
    // last_used_at e informativo; nao transforma uma sessao valida em erro de login.
  }

  const user = await findUserById(session.user_id);
  if (!user) return null;

  const allergies = await getUserAllergies(user.id);
  return {
    user: toPublicUser(user, allergies),
    tokenHash,
  };
}

export async function logoutByToken(token) {
  if (!token) return;
  await deleteSessionByTokenHash(hashSessionToken(token));
}
