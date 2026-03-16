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
