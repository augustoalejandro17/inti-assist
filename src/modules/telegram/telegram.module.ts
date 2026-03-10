import { Module } from "@nestjs/common";
import { TelegramController } from "./telegram.controller";
import { TelegramService } from "./telegram.service";
import { UsersModule } from "../users/users.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { TrackerModule } from "../tracker/tracker.module";

@Module({
  imports: [UsersModule, IntelligenceModule, TrackerModule],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
