import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const logger = new Logger("Bootstrap");

  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === "production"
        ? ["error", "warn", "log"]
        : ["error", "warn", "log", "debug", "verbose"],
  });

  // Enable CORS for development
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  });

  // Global prefix (optional - remove if you want root endpoints)
  // app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Inti Assist MVP running on port ${port}`);
  logger.log(`📍 Webhook endpoint: POST /webhook`);
  logger.log(`❤️ Health check: GET /health`);
}

bootstrap();
