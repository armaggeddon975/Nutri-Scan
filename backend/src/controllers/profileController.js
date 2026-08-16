import { getProfile, updateAllergies } from "../services/profileService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const profile = asyncHandler(async (req, res) => {
  const user = await getProfile(req.user.id);
  res.json({ user });
});

export const updateProfileAllergies = asyncHandler(async (req, res) => {
  const user = await updateAllergies(req.user.id, req.body);
  res.json({ user });
});
