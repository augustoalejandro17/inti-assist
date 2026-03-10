import {
  Controller,
  Post,
  Body,
  Get,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { TelegramService } from "./telegram.service";
import { TelegramUpdate } from "./dto/telegram-update.dto";

@Controller("telegram")
export class TelegramController {
  private readonly logger = new Logger(TelegramController.name);

  constructor(private readonly telegramService: TelegramService) {}

  /**
   * Telegram Webhook Endpoint
   * Receives updates from Telegram Bot API
   */
  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() update: TelegramUpdate,
  ): Promise<{ ok: boolean }> {
    this.logger.debug(`Received webhook update: ${update.update_id}`);

    // Process update asynchronously to respond quickly
    // Telegram expects a response within 60 seconds
    this.telegramService.processUpdate(update).catch((error) => {
      this.logger.error("Error processing update:", error);
    });

    return { ok: true };
  }

  /**
   * Health check endpoint
   */
  @Get("health")
  healthCheck(): {
    status: string;
    timestamp: string;
    services: {
      telegram: boolean;
    };
  } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        telegram: this.telegramService.isConfigured(),
      },
    };
  }

  /**
   * Root endpoint - useful for Vercel deployment verification
   */
  @Get()
  root(): { message: string; version: string } {
    return {
      message: "Inti Assist MVP - Fitness & Nutrition Tracker Bot",
      version: "0.1.0",
    };
  }
}
