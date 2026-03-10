import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { Metric, Prisma } from "@prisma/client";
import { getStartOfDay, getEndOfDay } from "../../common/utils/date.utils";

export interface CreateMetricDto {
  userId: string;
  category: string;
  name: string;
  value: number;
  unit: string;
  details?: Record<string, unknown>;
  loggedAt?: Date;
}

export interface MetricSummary {
  category: string;
  totalValue: number;
  unit: string;
  count: number;
  items: Metric[];
}

@Injectable()
export class TrackerService {
  private readonly logger = new Logger(TrackerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new metric entry
   */
  async createMetric(data: CreateMetricDto): Promise<Metric> {
    this.logger.log(`Creating metric: ${data.category} - ${data.name}`);

    return this.prisma.metric.create({
      data: {
        userId: data.userId,
        category: data.category,
        name: data.name,
        value: data.value,
        unit: data.unit,
        details: data.details as Prisma.InputJsonValue,
        loggedAt: data.loggedAt || new Date(),
      },
    });
  }

  /**
   * Create multiple metrics at once
   */
  async createManyMetrics(metrics: CreateMetricDto[]): Promise<Metric[]> {
    const results: Metric[] = [];

    for (const metric of metrics) {
      const created = await this.createMetric(metric);
      results.push(created);
    }

    return results;
  }

  /**
   * Get metrics for a user on a specific date
   */
  async getMetricsByDate(
    userId: string,
    date: Date = new Date(),
    timezone = "UTC",
  ): Promise<Metric[]> {
    const startOfDay = getStartOfDay(date, timezone);
    const endOfDay = getEndOfDay(date, timezone);

    return this.prisma.metric.findMany({
      where: {
        userId,
        loggedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { loggedAt: "desc" },
    });
  }

  /**
   * Get metrics summary for a user by category
   */
  async getDailySummary(
    userId: string,
    date: Date = new Date(),
    timezone = "UTC",
  ): Promise<MetricSummary[]> {
    const metrics = await this.getMetricsByDate(userId, date, timezone);

    const summaryMap = new Map<string, MetricSummary>();

    for (const metric of metrics) {
      const existing = summaryMap.get(metric.category);

      if (existing) {
        existing.totalValue += metric.value;
        existing.count += 1;
        existing.items.push(metric);
      } else {
        summaryMap.set(metric.category, {
          category: metric.category,
          totalValue: metric.value,
          unit: metric.unit,
          count: 1,
          items: [metric],
        });
      }
    }

    return Array.from(summaryMap.values());
  }

  /**
   * Get recent metrics for a user
   */
  async getRecentMetrics(userId: string, limit = 10): Promise<Metric[]> {
    return this.prisma.metric.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Get metrics by category
   */
  async getMetricsByCategory(
    userId: string,
    category: string,
    limit = 50,
  ): Promise<Metric[]> {
    return this.prisma.metric.findMany({
      where: { userId, category },
      orderBy: { loggedAt: "desc" },
      take: limit,
    });
  }

  /**
   * Delete a metric
   */
  async deleteMetric(metricId: string, userId: string): Promise<Metric | null> {
    // First verify the metric belongs to the user
    const metric = await this.prisma.metric.findFirst({
      where: { id: metricId, userId },
    });

    if (!metric) {
      return null;
    }

    return this.prisma.metric.delete({
      where: { id: metricId },
    });
  }
}
