import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { User, Prisma } from "@prisma/client";

export interface TelegramUserData {
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find or create a user by their Telegram ID
   */
  async findOrCreate(data: TelegramUserData): Promise<User> {
    const { telegramId, username, firstName, lastName } = data;

    const existingUser = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (existingUser) {
      // Update user info if changed
      if (
        existingUser.username !== username ||
        existingUser.firstName !== firstName ||
        existingUser.lastName !== lastName
      ) {
        return this.prisma.user.update({
          where: { telegramId },
          data: { username, firstName, lastName },
        });
      }
      return existingUser;
    }

    this.logger.log(`Creating new user with Telegram ID: ${telegramId}`);
    return this.prisma.user.create({
      data: {
        telegramId,
        username,
        firstName,
        lastName,
      },
    });
  }

  /**
   * Find user by Telegram ID
   */
  async findByTelegramId(telegramId: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { telegramId },
    });
  }

  /**
   * Update user settings
   */
  async updateSettings(
    userId: string,
    settings: Prisma.InputJsonValue,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { settings },
    });
  }

  /**
   * Update user timezone
   */
  async updateTimezone(userId: string, timezone: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { timezone },
    });
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  }

  /**
   * Update user profile with onboarding data
   */
  async updateProfile(
    userId: string,
    profileData: Record<string, unknown>,
  ): Promise<User> {
    this.logger.log(
      `Updating profile for user ${userId} with data:`,
      profileData,
    );

    const updateData: any = {};

    // Handle each field explicitly to ensure proper types
    if (profileData.age !== undefined) updateData.age = Number(profileData.age);
    if (profileData.activityLevel !== undefined)
      updateData.activityLevel = String(profileData.activityLevel);
    if (profileData.goals !== undefined)
      updateData.goals = String(profileData.goals);
    if (profileData.mealsPerDay !== undefined)
      updateData.mealsPerDay = Number(profileData.mealsPerDay);
    if (profileData.mealTimes !== undefined)
      updateData.mealTimes = profileData.mealTimes;
    if (profileData.reminderTimes !== undefined)
      updateData.reminderTimes = profileData.reminderTimes;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    this.logger.log(`Profile updated successfully for user ${userId}`);
    return updated;
  }

  /**
   * Mark onboarding as completed
   */
  async completeOnboarding(userId: string): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
  }

  /**
   * Get users who haven't been active for a certain time
   */
  async getInactiveUsers(hoursSinceLastActive: number): Promise<User[]> {
    const cutoffTime = new Date(
      Date.now() - hoursSinceLastActive * 60 * 60 * 1000,
    );

    return this.prisma.user.findMany({
      where: {
        isActive: true,
        onboardingCompleted: true,
        lastActiveAt: {
          lt: cutoffTime,
        },
      },
    });
  }
}
