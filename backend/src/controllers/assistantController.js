import { answerAssistantChat } from "../ai/assistantService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const chat = asyncHandler(async (req, res) => {
  const result = await answerAssistantChat(req, req.body);
  res.json(result);
});
