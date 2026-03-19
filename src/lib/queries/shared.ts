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

/**
 * Convert range string like "-1h", "-30m", "-7d" to PostgreSQL interval string.
 * Examples: "-1h" → "1 hour", "-30m" → "30 minutes", "-7d" → "7 days"
 */
export function parseRangeInterval(range: string): string {
  const match = range.match(/^-(\d+)([smhd])$/);
  if (!match) return '1 hour';
  const n = match[1];
  const units: Record<string, string> = { 
    s: 'seconds', 
    m: 'minutes', 
    h: 'hours', 
    d: 'days' 
  };
  return `${n} ${units[match[2]!]}`;
}

/**
 * Pick a sensible aggregation window based on query range.
 * Returns PostgreSQL interval string for use with time_bucket().
 */
export function rangeToWindow(range: string): string {
  const match = range.match(/^-(\d+)([smhd])$/);
  if (!match) return '1 minute';
  const n = parseInt(match[1]!);
  const unit = match[2];
  const minutes = unit === 's' ? n / 60 : unit === 'm' ? n : unit === 'h' ? n * 60 : n * 1440;
  if (minutes <= 60)   return '1 minute';
  if (minutes <= 360)  return '5 minutes';
  if (minutes <= 1440) return '15 minutes';
  if (minutes <= 4320) return '30 minutes';
  return '1 hour';
}
