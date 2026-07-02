/**
 * Analytics Service
 *
 * Records OTP events across all four time periods (hourly/daily/weekly/monthly)
 * in a single fire-and-forget call. Never throws — analytics failures must
 * never block the critical OTP path.
 *
 * Each upsert uses $setOnInsert + $inc in a single findOneAndUpdate to ensure
 * the record exists and the counters are incremented atomically.
 */

import connectToDatabase from "~/config/database";
import AnalyticsModel from "~/models/analytics.model";
import type { AnalyticsPeriod, AnalyticsIncrementFields } from "~/types/analytics.types";

interface PeriodInfo {
  period: AnalyticsPeriod;
  key: string;
  start: Date;
  end: Date;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function getAllPeriods(): PeriodInfo[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  const h = now.getUTCHours();

  // Hourly
  const hourStart = new Date(Date.UTC(y, mo, d, h));
  const hourEnd = new Date(Date.UTC(y, mo, d, h + 1));
  const hourKey = `${now.toISOString().slice(0, 13)}`; // "2026-06-30T14"

  // Daily
  const dayStart = new Date(Date.UTC(y, mo, d));
  const dayEnd = new Date(Date.UTC(y, mo, d + 1));
  const dayKey = `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // Weekly (ISO week, starts Monday)
  const dayOfWeek = now.getUTCDay() || 7;
  const weekStart = new Date(Date.UTC(y, mo, d - dayOfWeek + 1));
  const weekEnd = new Date(Date.UTC(y, mo, d - dayOfWeek + 8));
  const week = getISOWeek(now);
  const weekKey = `${y}-W${String(week).padStart(2, "0")}`;

  // Monthly
  const monthStart = new Date(Date.UTC(y, mo, 1));
  const monthEnd = new Date(Date.UTC(y, mo + 1, 1));
  const monthKey = `${y}-${String(mo + 1).padStart(2, "0")}`;

  return [
    { period: "hourly", key: hourKey, start: hourStart, end: hourEnd },
    { period: "daily", key: dayKey, start: dayStart, end: dayEnd },
    { period: "weekly", key: weekKey, start: weekStart, end: weekEnd },
    { period: "monthly", key: monthKey, start: monthStart, end: monthEnd },
  ];
}

export class AnalyticsService {
  /**
   * Records one or more counter increments across all time periods.
   * Completely fire-and-forget — the caller does NOT await this.
   *
   * Usage:
   *   void analyticsService.record(shop, { otpRequested: 1, otpSent: 1 });
   */
  async record(
    shopDomain: string,
    fields: AnalyticsIncrementFields,
    countryCode?: string
  ): Promise<void> {
    try {
      await connectToDatabase();

      const periods = getAllPeriods();
      const inc: Record<string, number> = {};

      for (const [key, val] of Object.entries(fields)) {
        if (val !== undefined && val > 0) inc[key] = val;
      }

      if (Object.keys(inc).length === 0) return;

      // Upsert each period with a single atomic findOneAndUpdate
      await Promise.all(
        periods.map(({ period, key, start, end }) =>
          AnalyticsModel.findOneAndUpdate(
            { shopDomain: shopDomain.toLowerCase(), period, periodKey: key },
            {
              $setOnInsert: {
                shopDomain: shopDomain.toLowerCase(),
                period,
                periodKey: key,
                periodStart: start,
                periodEnd: end,
              },
              $inc: inc,
            },
            { upsert: true, new: true }
          )
            .lean()
            .exec()
            .then(() => {
              if (countryCode && period === "daily") {
                return AnalyticsModel.updateOne(
                  { shopDomain: shopDomain.toLowerCase(), period, periodKey: key },
                  { $inc: { [`byCountry.${countryCode.toUpperCase()}`]: 1 } }
                ).exec();
              }
            })
            .catch(() => {
              // Swallow per-period errors — analytics must not interrupt OTP flow
            })
        )
      );
    } catch {
      // Swallow all analytics errors silently
    }
  }

  /**
   * Increments the byChannel counter for a specific period.
   */
  async recordChannel(
    shopDomain: string,
    channel: "sms" | "email" | "whatsapp" | "voice",
    increment = 1
  ): Promise<void> {
    try {
      await connectToDatabase();
      const { key, start, end } = getAllPeriods().find((p) => p.period === "daily")!;
      await AnalyticsModel.findOneAndUpdate(
        { shopDomain: shopDomain.toLowerCase(), period: "daily", periodKey: key },
        {
          $setOnInsert: { periodStart: start, periodEnd: end },
          $inc: { [`byChannel.${channel}`]: increment },
        },
        { upsert: true }
      )
        .lean()
        .exec();
    } catch {
      // Swallow
    }
  }
}

export const analyticsService = new AnalyticsService();
