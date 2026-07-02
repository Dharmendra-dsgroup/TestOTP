/**
 * AnalyticsQueryService — read-only analytics aggregations.
 *
 * Separate from AnalyticsService (write path). All methods query the
 * `analytics` collection and return typed, pre-aggregated data ready
 * for the dashboard UI.
 *
 * Services NEVER throw — all methods return ServiceResult<T>.
 */

import connectToDatabase from "~/config/database";
import { AnalyticsModel } from "~/models/analytics.model";
import {
  serviceSuccess,
  serviceFailure,
  type ServiceResult,
} from "~/types/common.types";

// ─── Output types ─────────────────────────────────────────────────────────────

export interface OverviewMetrics {
  totalRequested: number;
  totalSent: number;
  totalVerified: number;
  totalLoginCount: number;
  totalNewCustomers: number;
  totalBlocked: number;
  /** verified / sent * 100 — 0 if sent === 0 */
  verificationRate: number;
  /** sent / requested * 100 — 0 if requested === 0 */
  deliveryRate: number;
}

export interface TimeSeriesPoint {
  /** ISO date string "2026-06-30" */
  date: string;
  otpRequested: number;
  otpSent: number;
  otpVerified: number;
}

export interface ChannelBreakdown {
  sms: number;
  email: number;
  whatsapp: number;
  voice: number;
}

export interface CountryDataPoint {
  country: string;
  count: number;
}

export interface ConversionFunnelStep {
  label: string;
  value: number;
}

export type RangeKey = "7d" | "30d" | "90d";

// ─── Service ──────────────────────────────────────────────────────────────────

export class AnalyticsQueryService {
  /** Calculates the start date for a given range key from today (UTC). */
  rangeStart(range: RangeKey): Date {
    const now = new Date();
    const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days)
    );
  }

  /**
   * Overview KPI cards — totals across the selected date range.
   */
  async getOverviewMetrics(
    shopDomain: string,
    range: RangeKey
  ): Promise<ServiceResult<OverviewMetrics>> {
    try {
      await connectToDatabase();
      const start = this.rangeStart(range);

      const result = await AnalyticsModel.aggregate<{
        totalRequested: number;
        totalSent: number;
        totalVerified: number;
        totalLoginCount: number;
        totalNewCustomers: number;
        totalBlocked: number;
      }>([
        {
          $match: {
            shopDomain: shopDomain.toLowerCase(),
            period: "daily",
            periodStart: { $gte: start },
          },
        },
        {
          $group: {
            _id: null,
            totalRequested: { $sum: "$otpRequested" },
            totalSent: { $sum: "$otpSent" },
            totalVerified: { $sum: "$otpVerified" },
            totalLoginCount: { $sum: "$loginCount" },
            totalNewCustomers: { $sum: "$newCustomers" },
            totalBlocked: { $sum: "$otpBlocked" },
          },
        },
      ]).exec();

      const raw = result[0] ?? {
        totalRequested: 0,
        totalSent: 0,
        totalVerified: 0,
        totalLoginCount: 0,
        totalNewCustomers: 0,
        totalBlocked: 0,
      };

      const verificationRate =
        raw.totalSent > 0
          ? Math.round((raw.totalVerified / raw.totalSent) * 100)
          : 0;

      const deliveryRate =
        raw.totalRequested > 0
          ? Math.round((raw.totalSent / raw.totalRequested) * 100)
          : 0;

      return serviceSuccess({ ...raw, verificationRate, deliveryRate });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Analytics overview query failed: ${msg}`, 500);
    }
  }

  /**
   * Daily time series for the line chart.
   * Returns one point per calendar day in the range, with 0-fill for missing days.
   */
  async getTimeSeries(
    shopDomain: string,
    range: RangeKey
  ): Promise<ServiceResult<TimeSeriesPoint[]>> {
    try {
      await connectToDatabase();
      const start = this.rangeStart(range);
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

      const records = await AnalyticsModel.find(
        {
          shopDomain: shopDomain.toLowerCase(),
          period: "daily",
          periodStart: { $gte: start },
        },
        {
          periodStart: 1,
          periodKey: 1,
          otpRequested: 1,
          otpSent: 1,
          otpVerified: 1,
        }
      )
        .sort({ periodStart: 1 })
        .lean()
        .exec();

      // Build a lookup map from periodKey → record
      const byKey = new Map(
        records.map((r) => [
          r.periodKey,
          {
            otpRequested: r.otpRequested,
            otpSent: r.otpSent,
            otpVerified: r.otpVerified,
          },
        ])
      );

      // Generate all dates in range, filling zeros for missing days
      const points: TimeSeriesPoint[] = [];
      const now = new Date();
      for (let i = days; i >= 0; i--) {
        const d = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth(),
            now.getUTCDate() - i
          )
        );
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
        const found = byKey.get(key);
        points.push({
          date: key,
          otpRequested: found?.otpRequested ?? 0,
          otpSent: found?.otpSent ?? 0,
          otpVerified: found?.otpVerified ?? 0,
        });
      }

      return serviceSuccess(points);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Analytics time series query failed: ${msg}`, 500);
    }
  }

  /**
   * Channel breakdown across the range (sms / email / whatsapp / voice).
   */
  async getChannelBreakdown(
    shopDomain: string,
    range: RangeKey
  ): Promise<ServiceResult<ChannelBreakdown>> {
    try {
      await connectToDatabase();
      const start = this.rangeStart(range);

      const result = await AnalyticsModel.aggregate<{
        sms: number;
        email: number;
        whatsapp: number;
        voice: number;
      }>([
        {
          $match: {
            shopDomain: shopDomain.toLowerCase(),
            period: "daily",
            periodStart: { $gte: start },
          },
        },
        {
          $group: {
            _id: null,
            sms: { $sum: "$byChannel.sms" },
            email: { $sum: "$byChannel.email" },
            whatsapp: { $sum: "$byChannel.whatsapp" },
            voice: { $sum: "$byChannel.voice" },
          },
        },
      ]).exec();

      return serviceSuccess(
        result[0] ?? { sms: 0, email: 0, whatsapp: 0, voice: 0 }
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Analytics channel query failed: ${msg}`, 500);
    }
  }

  /**
   * Top 10 countries by OTP volume across the range.
   * byCountry is a Mixed map { "IN": 100, "US": 50, ... } on each daily record.
   * We use $objectToArray + $unwind to flatten it, then group by country.
   */
  async getCountryBreakdown(
    shopDomain: string,
    range: RangeKey
  ): Promise<ServiceResult<CountryDataPoint[]>> {
    try {
      await connectToDatabase();
      const start = this.rangeStart(range);

      const result = await AnalyticsModel.aggregate<{
        _id: string;
        count: number;
      }>([
        {
          $match: {
            shopDomain: shopDomain.toLowerCase(),
            period: "daily",
            periodStart: { $gte: start },
            byCountry: { $exists: true, $ne: {} },
          },
        },
        { $project: { pairs: { $objectToArray: "$byCountry" } } },
        { $unwind: "$pairs" },
        {
          $group: {
            _id: "$pairs.k",
            count: { $sum: "$pairs.v" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]).exec();

      return serviceSuccess(
        result.map((r) => ({ country: r._id, count: r.count }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Analytics country query failed: ${msg}`, 500);
    }
  }

  /**
   * Conversion funnel: Requested → Sent → Verified → Logged In
   */
  async getConversionFunnel(
    shopDomain: string,
    range: RangeKey
  ): Promise<ServiceResult<ConversionFunnelStep[]>> {
    const metrics = await this.getOverviewMetrics(shopDomain, range);
    if (!metrics.success) return serviceFailure(metrics.error!, 500);

    const { totalRequested, totalSent, totalVerified, totalLoginCount } =
      metrics.data;

    return serviceSuccess([
      { label: "OTP Requested", value: totalRequested },
      { label: "OTP Sent", value: totalSent },
      { label: "Code Verified", value: totalVerified },
      { label: "Login Completed", value: totalLoginCount },
    ]);
  }

  /**
   * Comparison: current period vs prior period of same length.
   * Returns the delta percentage for key metrics.
   */
  async getPeriodComparison(
    shopDomain: string,
    range: RangeKey
  ): Promise<
    ServiceResult<{
      requestedDelta: number;
      verifiedDelta: number;
      newCustomersDelta: number;
    }>
  > {
    try {
      await connectToDatabase();
      const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
      const now = new Date();
      const currentStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - days
        )
      );
      const priorStart = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() - days * 2
        )
      );

      const [current, prior] = await Promise.all([
        AnalyticsModel.aggregate<{
          totalRequested: number;
          totalVerified: number;
          totalNewCustomers: number;
        }>([
          {
            $match: {
              shopDomain: shopDomain.toLowerCase(),
              period: "daily",
              periodStart: { $gte: currentStart },
            },
          },
          {
            $group: {
              _id: null,
              totalRequested: { $sum: "$otpRequested" },
              totalVerified: { $sum: "$otpVerified" },
              totalNewCustomers: { $sum: "$newCustomers" },
            },
          },
        ]).exec(),
        AnalyticsModel.aggregate<{
          totalRequested: number;
          totalVerified: number;
          totalNewCustomers: number;
        }>([
          {
            $match: {
              shopDomain: shopDomain.toLowerCase(),
              period: "daily",
              periodStart: { $gte: priorStart, $lt: currentStart },
            },
          },
          {
            $group: {
              _id: null,
              totalRequested: { $sum: "$otpRequested" },
              totalVerified: { $sum: "$otpVerified" },
              totalNewCustomers: { $sum: "$newCustomers" },
            },
          },
        ]).exec(),
      ]);

      const cur = current[0] ?? {
        totalRequested: 0,
        totalVerified: 0,
        totalNewCustomers: 0,
      };
      const prev = prior[0] ?? {
        totalRequested: 0,
        totalVerified: 0,
        totalNewCustomers: 0,
      };

      const delta = (curr: number, prev: number) =>
        prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100);

      return serviceSuccess({
        requestedDelta: delta(cur.totalRequested, prev.totalRequested),
        verifiedDelta: delta(cur.totalVerified, prev.totalVerified),
        newCustomersDelta: delta(cur.totalNewCustomers, prev.totalNewCustomers),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return serviceFailure(`Analytics comparison query failed: ${msg}`, 500);
    }
  }
}

export const analyticsQueryService = new AnalyticsQueryService();
