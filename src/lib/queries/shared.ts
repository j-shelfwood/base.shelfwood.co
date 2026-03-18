/**
 * Shared types and utilities for query modules.
 */

export interface TimePoint {
  time: string;
  value: number;
}

export interface ItemVelocity {
  item: string;
  delta: number;      // positive = net gain, negative = net loss
  first: number;
  last: number;
}

/** Pick a sensible aggregation window based on query range */
export function rangeToWindow(range: string): string {
  const match = range.match(/^-(\d+)([smhd])$/);
  if (!match) return '1m';
  const n = parseInt(match[1]!);
  const unit = match[2];
  const minutes = unit === 's' ? n / 60 : unit === 'm' ? n : unit === 'h' ? n * 60 : n * 1440;
  if (minutes <= 60)   return '1m';
  if (minutes <= 360)  return '5m';
  if (minutes <= 1440) return '15m';
  if (minutes <= 4320) return '30m';
  return '1h';
}

/**
 * Wraps a history query function to fall back to a longer range when the
 * requested range returns no data (e.g. collector offline).  It retries with
 * -30d and returns the tail of that result matching the original point count,
 * so charts always show the last known data instead of "NO DATA".
 */
export async function withHistoryFallback(
  queryFn: (range: string) => Promise<TimePoint[]>,
  range: string
): Promise<TimePoint[]> {
  const result = await queryFn(range);
  if (result.length > 0) return result;
  // Retry with a wide window to find any recent data
  const fallback = await queryFn('-30d');
  return fallback;
}
