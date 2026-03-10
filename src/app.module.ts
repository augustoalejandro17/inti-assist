import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { DatabaseModule } from "./database/database.module";
import { TelegramModule } from "./modules/telegram/telegram.module";
import { UsersModule } from "./modules/users/users.module";
import { IntelligenceModule } from "./modules/intelligence/intelligence.module";
import { TrackerModule } from "./modules/tracker/tracker.module";
import {
  appConfig,
  telegramConfig,
  geminiConfig,
  groqConfig,
} from "./common/config";

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, telegramConfig, geminiConfig, groqConfig],
      envFilePath: [".env.local", ".env"],
    }),

    // Database
    DatabaseModule,

    // Feature Modules
    UsersModule,
    IntelligenceModule,
    TrackerModule,
    TelegramModule,
  ],
})
export class AppModule {}
