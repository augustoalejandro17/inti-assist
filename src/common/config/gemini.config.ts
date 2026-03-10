import { registerAs } from "@nestjs/config";

export default registerAs("gemini", () => ({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL || "models/gemini-2.5-flash-lite",
}));
