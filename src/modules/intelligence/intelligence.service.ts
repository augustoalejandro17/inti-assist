import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Groq from "groq-sdk";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { getSystemPrompt, UserContext } from "./prompts/system.prompt";

/**
 * Structured response from the AI analysis
 */
export interface AnalysisResult {
  intent:
    | "onboarding"
    | "log_food"
    | "log_exercise"
    | "log_weight"
    | "log_water"
    | "log_sleep"
    | "query"
    | "greeting"
    | "help"
    | "reminder_response"
    | "unknown";
  metrics: Array<{
    category: string;
    name: string;
    value: number;
    unit: string;
    details?: Record<string, unknown>;
  }>;
  onboardingData?: {
    age?: number;
    activityLevel?:
      | "sedentary"
      | "light"
      | "moderate"
      | "active"
      | "very_active";
    goals?: string;
    mealsPerDay?: number;
    mealTimes?: string[];
    reminderTimes?: string[];
  };
  response: string;
  confidence: number;
}

/**
 * Chat history entry for context
 */
export interface ChatHistoryEntry {
  message: string;
  response: string;
  createdAt: Date;
}

@Injectable()
export class IntelligenceService implements OnModuleInit {
  private readonly logger = new Logger(IntelligenceService.name);

  // Groq (primary)
  private groqClient: Groq | null = null;
  private groqModel: string;

  // Gemini (fallback)
  private geminiModel: GenerativeModel | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    // Initialize Groq (primary)
    const groqApiKey = this.configService.get<string>("groq.apiKey");
    this.groqModel =
      this.configService.get<string>("groq.model") ||
      "llama-3.3-70b-versatile";

    if (groqApiKey) {
      this.groqClient = new Groq({ apiKey: groqApiKey });
      this.logger.log(
        `✅ Groq AI initialized (primary) with model: ${this.groqModel}`,
      );
    } else {
      this.logger.warn("GROQ_API_KEY not configured. Groq will not be used.");
    }

    // Initialize Gemini (fallback)
    const geminiApiKey = this.configService.get<string>("gemini.apiKey");
    const geminiModelName =
      this.configService.get<string>("gemini.model") || "gemini-1.5-flash";

    if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      this.geminiModel = genAI.getGenerativeModel({
        model: geminiModelName,
        generationConfig: {
          responseMimeType: "application/json",
        },
      });
      this.logger.log(
        `✅ Gemini AI initialized (fallback) with model: ${geminiModelName}`,
      );
    } else {
      this.logger.warn(
        "GEMINI_API_KEY not configured. Gemini fallback will not work.",
      );
    }

    if (!groqApiKey && !geminiApiKey) {
      this.logger.error(
        "⚠️ No AI provider configured! Both GROQ_API_KEY and GEMINI_API_KEY are missing.",
      );
    }
  }

  /**
   * Analyze a user message and extract intent + metrics
   * Uses Groq as primary for text, but routes directly to Gemini for images
   */
  async analyzeMessage(
    text: string,
    userContext?: UserContext,
    chatHistory?: ChatHistoryEntry[],
    image?: { buffer: Buffer; mimeType: string },
  ): Promise<AnalysisResult> {
    const systemPrompt = getSystemPrompt(userContext);

    // Build conversation context from chat history
    const historyContext = this.buildHistoryContext(chatHistory);

    // Route direct to Gemini if there's an image
    if (image && this.geminiModel) {
      try {
        this.logger.debug("Image detected, routing directly to Gemini Vision");
        return await this.callGemini(text, systemPrompt, historyContext, image);
      } catch (error) {
        this.logger.error(`Gemini Vision failed: ${error}`);
        return this.createFallbackResponse(text);
      }
    } else if (image && !this.geminiModel) {
      this.logger.error("Image received but Gemini API is not configured");
      return this.createFallbackResponse(text);
    }

    // Default flow for text: Try Groq first (primary)
    if (this.groqClient) {
      try {
        const result = await this.callGroq(text, systemPrompt, historyContext);
        this.logger.debug("Response from: Groq ✓");
        return result;
      } catch (error) {
        this.logger.warn(
          `Groq failed, falling back to Gemini: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Fallback to Gemini
    if (this.geminiModel) {
      try {
        const result = await this.callGemini(
          text,
          systemPrompt,
          historyContext,
        );
        this.logger.debug("Response from: Gemini (fallback) ✓");
        return result;
      } catch (error) {
        this.logger.error(
          `Gemini also failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Both providers failed
    this.logger.error("All AI providers failed");
    return this.createFallbackResponse(text);
  }

  /**
   * Call Groq API
   */
  private async callGroq(
    text: string,
    systemPrompt: string,
    historyContext: string,
  ): Promise<AnalysisResult> {
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add history context if available
    if (historyContext) {
      messages.push({
        role: "system",
        content: `## HISTORIAL DE CONVERSACIÓN RECIENTE:\n${historyContext}`,
      });
    }

    messages.push({ role: "user", content: text });

    const completion = await this.groqClient!.chat.completions.create({
      model: this.groqModel,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      throw new Error("Empty response from Groq");
    }

    this.logger.debug(`Groq raw response: ${responseText}`);
    return this.parseAIResponse(responseText);
  }

  /**
   * Call Gemini API (Supports text and image multimodal)
   */
  private async callGemini(
    text: string,
    systemPrompt: string,
    historyContext: string,
    image?: { buffer: Buffer; mimeType: string },
  ): Promise<AnalysisResult> {
    const fullPrompt = historyContext
      ? `${systemPrompt}\n\n## HISTORIAL DE CONVERSACIÓN RECIENTE:\n${historyContext}`
      : systemPrompt;

    const chat = this.geminiModel!.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: fullPrompt }],
        },
        {
          role: "model",
          parts: [
            {
              text: "Entendido. Estoy listo para ayudarte con tus registros de fitness y nutrición. ¿En qué puedo asistirte?",
            },
          ],
        },
      ],
    });

    const userMessageParts: any[] = [{ text }];

    if (image) {
      userMessageParts.push({
        inlineData: {
          data: image.buffer.toString("base64"),
          mimeType: image.mimeType,
        },
      });
    }

    const result = await chat.sendMessage(userMessageParts);
    let responseText = result.response.text();

    this.logger.debug(`Gemini raw response: ${responseText}`);

    // Clean markdown code blocks if present
    responseText = responseText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return this.parseAIResponse(responseText);
  }

  /**
   * Build conversation context from recent chat history
   */
  private buildHistoryContext(chatHistory?: ChatHistoryEntry[]): string {
    if (!chatHistory || chatHistory.length === 0) return "";

    return chatHistory
      .map(
        (entry) =>
          `Usuario: ${entry.message}\nInti: ${entry.response}`,
      )
      .join("\n---\n");
  }

  /**
   * Parse AI response JSON with robust error handling
   */
  private parseAIResponse(responseText: string): AnalysisResult {
    try {
      // Clean potential markdown artifacts
      let cleaned = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Try to extract JSON if it's embedded in other text
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }

      const parsed = JSON.parse(cleaned) as Partial<AnalysisResult>;

      return {
        intent: parsed.intent || "unknown",
        metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
        onboardingData: parsed.onboardingData,
        response: parsed.response || "No pude procesar tu mensaje.",
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      };
    } catch (error) {
      this.logger.error(
        `Failed to parse AI response: ${error instanceof Error ? error.message : error}`,
      );
      this.logger.debug(`Raw text that failed to parse: ${responseText}`);

      // Try to extract just the response text from malformed JSON
      const responseMatch = responseText.match(
        /"response"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/,
      );
      if (responseMatch) {
        return {
          intent: "unknown",
          metrics: [],
          response: responseMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
          confidence: 0,
        };
      }

      // If the text itself is somewhat readable, use it as response
      if (
        responseText.length > 0 &&
        responseText.length < 2000 &&
        !responseText.startsWith("{")
      ) {
        return {
          intent: "unknown",
          metrics: [],
          response: responseText,
          confidence: 0,
        };
      }

      return this.createFallbackResponse("mensaje no procesado");
    }
  }

  /**
   * Create a fallback response when AI is not available
   */
  private createFallbackResponse(text: string): AnalysisResult {
    return {
      intent: "unknown",
      metrics: [],
      response: `Lo siento, no pude procesar tu mensaje. Por favor intenta de nuevo en unos momentos.`,
      confidence: 0,
    };
  }

  /**
   * Health check for AI service
   */
  isConfigured(): boolean {
    return !!(this.groqClient || this.geminiModel);
  }

  /**
   * Get which provider is active
   */
  getActiveProvider(): string {
    if (this.groqClient && this.geminiModel) return "groq+gemini";
    if (this.groqClient) return "groq";
    if (this.geminiModel) return "gemini";
    return "none";
  }
}
