import {
  clearSessionCookie,
  loginUser,
  logoutByToken,
  registerUser,
  setSessionCookie,
} from "../services/authService.js";
import { getRequestSessionToken } from "../middleware/authMiddleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  setSessionCookie(res, result.token);
  res.status(201).json({ user: result.user });
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  setSessionCookie(res, result.token);
  res.json({ user: result.user });
});

export const logout = asyncHandler(async (req, res) => {
  clearSessionCookie(res);
  const token = getRequestSessionToken(req);
  await logoutByToken(token);
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});
