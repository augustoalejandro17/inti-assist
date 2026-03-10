import { registerAs } from "@nestjs/config";

export default registerAs("telegram", () => ({
  token: process.env.TELEGRAM_TOKEN,
  webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
}));
