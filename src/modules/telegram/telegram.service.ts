import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { UsersService } from "../users/users.service";
import {
  IntelligenceService,
  AnalysisResult,
  ChatHistoryEntry,
} from "../intelligence/intelligence.service";
import { TrackerService, CreateMetricDto } from "../tracker/tracker.service";
import { TelegramUpdate, TelegramMessage } from "./dto/telegram-update.dto";

/** Maximum Telegram message length */
const TELEGRAM_MAX_LENGTH = 4096;

/** Number of recent chat messages to send as context */
const CHAT_HISTORY_LIMIT = 5;

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);
  private botToken: string;
  private readonly TELEGRAM_API = "https://api.telegram.org/bot";

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly intelligenceService: IntelligenceService,
    private readonly trackerService: TrackerService,
  ) {}

  onModuleInit() {
    this.botToken = this.configService.get<string>("telegram.token") || "";

    if (!this.botToken) {
      this.logger.warn("TELEGRAM_TOKEN not configured. Bot will not work.");
    } else {
      this.logger.log("✅ Telegram bot configured");
    }
  }

  /**
   * Process an incoming Telegram update
   */
  async processUpdate(update: TelegramUpdate): Promise<void> {
    this.logger.debug(`Processing update: ${update.update_id}`);

    const message = update.message || update.edited_message;

    if (!message || (!message.text && !message.photo)) {
      this.logger.debug("Update has no text or photo, skipping");
      return;
    }

    if (!message.from) {
      this.logger.debug("Update has no from user, skipping");
      return;
    }

    await this.handleMessage(message);
  }

  /**
   * Handle a message (text or photo)
   */
  private async handleMessage(message: TelegramMessage): Promise<void> {
    const { from, chat, photo } = message;
    // If it's a photo caption, treat it as the text message
    let text = message.text || message.caption || "";

    if (!from) return;

    try {
      // Check for commands first
      if (text.startsWith("/")) {
        await this.handleCommand(text, chat.id, from);
        return;
      }

      // 1. Find or create user
      const user = await this.usersService.findOrCreate({
        telegramId: from.id.toString(),
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
      });

      // 2. Update last active timestamp
      await this.usersService.updateLastActive(user.id);

      // 3. Build user context for AI
      const userContext: any = {
        timezone: user.timezone,
        onboardingCompleted: user.onboardingCompleted,
        age: user.age || undefined,
        activityLevel: user.activityLevel || undefined,
        goals: user.goals || undefined,
        firstName: user.firstName || undefined,
        lastActiveAt: user.lastActiveAt,
      };

      if (user.mealsPerDay) userContext.mealsPerDay = user.mealsPerDay;
      if (user.mealTimes) userContext.mealTimes = user.mealTimes;
      if (user.reminderTimes) userContext.reminderTimes = user.reminderTimes;

      // 4. Fetch recent chat history for context
      const chatHistory = await this.getRecentChatHistory(user.id);

      // 5. Download photo if present
      let imageData;
      if (photo && photo.length > 0) {
        // The array is sorted by size, get the last (largest) one
        const largestPhoto = photo[photo.length - 1];
        try {
          // Tell the user we received the image and are thinking
          await this.sendMessage(chat.id, "📸 ¡Imagen recibida! Analizando...");
          imageData = await this.downloadTelegramPhoto(largestPhoto.file_id);
          // Ensure we have some text even if the user didn't write a caption
          if (!text) {
             text = "Analiza los datos de esta imagen para registrar métricas.";
          }
        } catch (error) {
          this.logger.error(`Error downloading photo:`, error);
          await this.sendMessage(
            chat.id,
            "Hubo un error al intentar leer imagen, por favor envíala de nuevo.",
          );
          return;
        }
      }

      // 6. Analyze message with AI (with user context + chat history + image)
      const analysis = await this.intelligenceService.analyzeMessage(
        text,
        userContext,
        chatHistory,
        imageData,
      );

      // 7. Handle onboarding data if present
      if (analysis.intent === "onboarding" && analysis.onboardingData) {
        await this.handleOnboardingData(user.id, analysis.onboardingData);
      }

      // 7. Save metrics if any
      if (analysis.metrics.length > 0) {
        await this.saveMetrics(user.id, analysis);
      }

      // 8. Log the conversation
      await this.logConversation(
        user.id,
        text,
        analysis.response,
        analysis.intent,
        message,
      );

      // 9. Send response to user (with chunking for long messages)
      await this.sendMessage(chat.id, analysis.response);
    } catch (error) {
      this.logger.error("Error handling message:", error);
      await this.sendMessage(
        chat.id,
        "❌ Lo siento, hubo un error procesando tu mensaje. Por favor intenta de nuevo.",
      );
    }
  }

  /**
   * Handle bot commands (/start, /help, etc.)
   */
  private async handleCommand(
    text: string,
    chatId: number,
    from: { id: number; first_name: string; username?: string; last_name?: string; is_bot: boolean },
  ): Promise<void> {
    const command = text.split(" ")[0].toLowerCase().replace("@", "");

    switch (command) {
      case "/start": {
        // Ensure user exists
        await this.usersService.findOrCreate({
          telegramId: from.id.toString(),
          username: from.username,
          firstName: from.first_name,
          lastName: from.last_name,
        });

        const welcomeMessage =
          `👋 ¡Hola${from.first_name ? ` ${from.first_name}` : ""}! Soy Inti, tu compañero para cuidar tus hábitos diarios.\n\n` +
          `🍎 Puedo ayudarte a registrar:\n` +
          `  • Comidas y nutrición\n` +
          `  • Ejercicio y actividad\n` +
          `  • Peso corporal\n` +
          `  • Consumo de agua\n` +
          `  • Horas de sueño\n\n` +
          `Solo cuéntame lo que hiciste o comiste y yo me encargo del resto. Por ejemplo:\n` +
          `  "Desayuné 2 huevos con tostadas"\n` +
          `  "Corrí 5km en 30 minutos"\n\n` +
          `Para empezar, cuéntame un poco de ti. ¿Cuántos años tienes?`;

        await this.sendMessage(chatId, welcomeMessage);
        break;
      }

      case "/help": {
        const helpMessage =
          `📖 Comandos disponibles:\n\n` +
          `/start - Iniciar el bot\n` +
          `/help - Ver esta ayuda\n\n` +
          `💡 Ejemplos de lo que puedes decirme:\n\n` +
          `🍽️ Comidas:\n` +
          `  "Almorcé arroz con pollo"\n` +
          `  "Tomé un café con leche"\n\n` +
          `🏃 Ejercicio:\n` +
          `  "Hice 30 min de cardio"\n` +
          `  "Caminé 3km"\n\n` +
          `⚖️ Peso: "Peso 75kg"\n` +
          `💧 Agua: "Tomé 2 vasos de agua"\n` +
          `😴 Sueño: "Dormí 7 horas"\n\n` +
          `También puedes preguntarme cómo vas con tus hábitos del día.`;

        await this.sendMessage(chatId, helpMessage);
        break;
      }

      default:
        await this.sendMessage(
          chatId,
          `No reconozco ese comando. Usa /help para ver los comandos disponibles.`,
        );
    }
  }

  /**
   * Get recent chat history for AI context
   */
  private async getRecentChatHistory(
    userId: string,
  ): Promise<ChatHistoryEntry[]> {
    try {
      const recentLogs = await this.prisma.chatLog.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: CHAT_HISTORY_LIMIT,
        select: {
          message: true,
          response: true,
          createdAt: true,
        },
      });

      // Return in chronological order (oldest first)
      return recentLogs.reverse();
    } catch (error) {
      this.logger.warn("Could not fetch chat history:", error);
      return [];
    }
  }

  /**
   * Handle onboarding data from AI analysis
   */
  private async handleOnboardingData(
    userId: string,
    onboardingData: Record<string, unknown>,
  ): Promise<void> {
    this.logger.debug(
      `Processing onboarding data for user ${userId}:`,
      onboardingData,
    );

    const updateData: Record<string, unknown> = {};
    let shouldCompleteOnboarding = false;

    const hasValue = (val: unknown): boolean =>
      val !== undefined && val !== null && val !== "";

    if (hasValue(onboardingData.age))
      updateData.age = onboardingData.age;
    if (hasValue(onboardingData.activityLevel))
      updateData.activityLevel = onboardingData.activityLevel;
    if (hasValue(onboardingData.goals))
      updateData.goals = onboardingData.goals;
    if (hasValue(onboardingData.mealsPerDay))
      updateData.mealsPerDay = onboardingData.mealsPerDay;
    if (hasValue(onboardingData.mealTimes))
      updateData.mealTimes = onboardingData.mealTimes;
    if (hasValue(onboardingData.reminderTimes)) {
      updateData.reminderTimes = onboardingData.reminderTimes;
      shouldCompleteOnboarding = true;
    }

    if (Object.keys(updateData).length > 0) {
      this.logger.log(
        `📝 Actualizando perfil de usuario ${userId}`,
      );
      await this.usersService.updateProfile(userId, updateData);
    }

    if (shouldCompleteOnboarding) {
      await this.usersService.completeOnboarding(userId);
      this.logger.log(`✅ Usuario ${userId} completó el onboarding`);
    }
  }

  /**
   * Save metrics from AI analysis
   */
  private async saveMetrics(
    userId: string,
    analysis: AnalysisResult,
  ): Promise<void> {
    const metricsToCreate: CreateMetricDto[] = analysis.metrics.map((m) => ({
      userId,
      category: m.category,
      name: m.name,
      value: m.value,
      unit: m.unit,
      details: m.details,
    }));

    await this.trackerService.createManyMetrics(metricsToCreate);
    this.logger.log(
      `Saved ${metricsToCreate.length} metrics for user ${userId}`,
    );
  }

  /**
   * Log conversation to database
   */
  private async logConversation(
    userId: string,
    message: string,
    response: string,
    intent: string,
    rawPayload: TelegramMessage,
  ): Promise<void> {
    try {
      await this.prisma.chatLog.create({
        data: {
          userId,
          message,
          response,
          intent,
          rawPayload: JSON.parse(
            JSON.stringify(rawPayload),
          ) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      this.logger.error("Error logging conversation:", error);
      // Don't throw - logging failure shouldn't break the main flow
    }
  }

  /**
   * Download a photo from Telegram API and convert to Base64
   */
  private async downloadTelegramPhoto(
    fileId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    // 1. Get the file path from the file_id
    const fileResponse = await fetch(
      `${this.TELEGRAM_API}${this.botToken}/getFile?file_id=${fileId}`,
    );
    const fileData = await fileResponse.json();

    if (!fileData.ok) {
      throw new Error(`Failed to get file info: ${fileData.description}`);
    }

    const filePath = fileData.result.file_path;

    // 2. Download the actual file buffer
    const downloadUrl = `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
    const downloadResponse = await fetch(downloadUrl);
    
    if (!downloadResponse.ok) {
        throw new Error(`Failed to download file from ${downloadUrl}`);
    }

    const arrayBuffer = await downloadResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, mimeType: "image/jpeg" }; // Telegram photos are always JPEG
  }

  /**
   * Send a message to a Telegram chat
   * Handles chunking for messages > 4096 characters
   */
  async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.error("Cannot send message: Bot token not configured");
      return false;
    }

    // Chunk long messages
    const chunks = this.chunkMessage(text);

    for (const chunk of chunks) {
      const success = await this.sendSingleMessage(chatId, chunk);
      if (!success) return false;
    }

    return true;
  }

  /**
   * Send a single message chunk to Telegram
   */
  private async sendSingleMessage(
    chatId: number,
    text: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.TELEGRAM_API}${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            // No parse_mode — plain text is safest with AI-generated content
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to send message: ${error}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error("Error sending Telegram message:", error);
      return false;
    }
  }

  /**
   * Split a message into chunks of max TELEGRAM_MAX_LENGTH
   * Tries to split at newlines or spaces for readability
   */
  private chunkMessage(text: string): string[] {
    if (text.length <= TELEGRAM_MAX_LENGTH) {
      return [text];
    }

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= TELEGRAM_MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Find a good split point (newline or space)
      let splitAt = remaining.lastIndexOf("\n", TELEGRAM_MAX_LENGTH);
      if (splitAt < TELEGRAM_MAX_LENGTH * 0.5) {
        splitAt = remaining.lastIndexOf(" ", TELEGRAM_MAX_LENGTH);
      }
      if (splitAt < TELEGRAM_MAX_LENGTH * 0.5) {
        splitAt = TELEGRAM_MAX_LENGTH;
      }

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }

    return chunks;
  }

  /**
   * Set webhook URL for the bot
   */
  async setWebhook(webhookUrl: string): Promise<boolean> {
    if (!this.botToken) {
      this.logger.error("Cannot set webhook: Bot token not configured");
      return false;
    }

    try {
      const response = await fetch(
        `${this.TELEGRAM_API}${this.botToken}/setWebhook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: webhookUrl,
            allowed_updates: ["message", "edited_message", "callback_query"],
          }),
        },
      );

      const result = await response.json();
      this.logger.log(`Webhook set result: ${JSON.stringify(result)}`);

      return result.ok === true;
    } catch (error) {
      this.logger.error("Error setting webhook:", error);
      return false;
    }
  }

  /**
   * Check if the bot is properly configured
   */
  isConfigured(): boolean {
    return !!this.botToken;
  }
}
