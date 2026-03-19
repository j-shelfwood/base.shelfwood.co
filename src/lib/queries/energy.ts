/**
 * Energy telemetry queries (TimescaleDB/SQL).
 */

import { sql } from '../db';
import { type TimePoint, parseRangeInterval, rangeToWindow } from './shared';

export interface EnergySummary {
  stored_fe: number;
  capacity_fe: number;
  percent: number;
}

export async function energySummary(): Promise<EnergySummary | null> {
  const rows = await sql`
    SELECT DISTINCT ON (node)
      node,
      stored_fe,
      capacity_fe,
      percent
    FROM energy_total
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, time DESC
  `;
  
  if (rows.length === 0) return null;
  const r = rows[0]!;
  
  return {
    stored_fe: Number(r.stored_fe) || 0,
    capacity_fe: Number(r.capacity_fe) || 0,
    percent: Number(r.percent) || 0,
  };
}

export interface EnergyFlow {
  name: string;
  rate_fe_t: number;
}

export async function energyFlow(): Promise<EnergyFlow[]> {
  const rows = await sql`
    SELECT DISTINCT ON (node, name)
      node,
      name,
      rate_fe_t
    FROM energy_flow
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, name, time DESC
  `;
  
  return rows.map(r => ({
    name: String(r.name),
    rate_fe_t: Number(r.rate_fe_t) || 0,
  }));
}

export async function energyHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      AVG(percent) as avg_percent
    FROM energy_total
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_percent) || 0,
  }));
}

export async function energyFlowHistory(range = '-1h'): Promise<{ time: string; value: number; name: string }[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      name,
      AVG(rate_fe_t) as avg_rate
    FROM energy_flow
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY bucket, name
    ORDER BY bucket, name
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_rate) || 0,
    name: String(r.name),
  }));
}

export async function energyStoredHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      AVG(stored_fe) as avg_stored
    FROM energy_total
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_stored) || 0,
  }));
}

export async function energyNetHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      SUM(rate_fe_t) as total_net
    FROM energy_flow
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.total_net) || 0,
  }));
}

export interface EnergyDevice {
  name: string;
  type: string;
  storage: string;
  stored_fe: number;
  capacity_fe: number;
  percent: number;
}

export async function energyDevices(): Promise<EnergyDevice[]> {
  const rows = await sql`
    SELECT DISTINCT ON (node, name)
      node,
      name,
      storage,
      stored_fe,
      capacity_fe,
      percent
    FROM energy_storage
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, name, time DESC
  `;
  
  return rows
    .map(r => ({
      name: String(r.name),
      type: '', // Not in schema, set empty
      storage: String(r.storage),
      stored_fe: Number(r.stored_fe) || 0,
      capacity_fe: Number(r.capacity_fe) || 0,
      percent: Number(r.percent) || 0,
    }))
    .sort((a, b) => b.capacity_fe - a.capacity_fe);
}

export async function energyDeviceHistory(name: string, range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  
  const rows = await sql`
    SELECT 
      time_bucket('1 minute'::interval, time) as bucket,
      AVG(percent) as avg_percent
    FROM energy_storage
    WHERE time >= NOW() - ${interval}::interval
      AND name = ${name}
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_percent) || 0,
  }));
}
