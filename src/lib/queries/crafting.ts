/**
 * Crafting telemetry queries (TimescaleDB/SQL).
 */

import { sql } from '../db';
import { type TimePoint, parseRangeInterval, rangeToWindow } from './shared';

export interface CraftingJob {
  item: string;
  cpu: string;
  cpu_index: number;
  quantity: number;
  crafted: number;
  completion: number;
}

export async function craftingJobs(): Promise<CraftingJob[]> {
  const rows = await sql`
    SELECT DISTINCT ON (node, source, item, cpu_index)
      node,
      source,
      item,
      cpu,
      cpu_index,
      quantity,
      crafted,
      completion
    FROM ae_crafting_job
    WHERE time >= NOW() - INTERVAL '10 minutes'
    ORDER BY node, source, item, cpu_index, time DESC
  `;

  return rows.map(r => {
    const cpuName = String(r.cpu || 'unnamed');
    const idx = Number(r.cpu_index) || 0;
    const displayCpu = cpuName.toLowerCase() === 'unnamed' ? `CPU ${idx}` : cpuName;
    return {
      item: String(r.item),
      cpu: displayCpu,
      cpu_index: idx,
      quantity: Number(r.quantity) || 0,
      crafted: Number(r.crafted) || 0,
      completion: Number(r.completion) || 0,
    };
  });
}

export async function craftingTaskCount(): Promise<number> {
  const rows = await sql`
    SELECT DISTINCT ON (node, source)
      node,
      source,
      count
    FROM ae_crafting_task
    WHERE time >= NOW() - INTERVAL '10 minutes'
    ORDER BY node, source, time DESC
    LIMIT 1
  `;
  
  if (rows.length === 0) return 0;
  return Number(rows[0]?.count) || 0;
}

export async function craftingTaskHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      AVG(count) as avg_count
    FROM ae_crafting_task
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_count) || 0,
  }));
}

export interface CraftingFrequencyItem {
  item: string;
  job_count: number;
  total_qty: number;
}

export async function craftingFrequency(range = '-7d'): Promise<CraftingFrequencyItem[]> {
  const interval = parseRangeInterval(range);

  const rows = await sql`
    SELECT
      item,
      COUNT(*) as job_count,
      SUM(quantity) as total_qty
    FROM ae_crafting_job
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY item
    ORDER BY COUNT(*) DESC
    LIMIT 20
  `;

  return rows.map(r => ({
    item: String(r.item),
    job_count: Number(r.job_count) || 0,
    total_qty: Number(r.total_qty) || 0,
  }));
}

export async function craftingCpuHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      bucket,
      CASE 
        WHEN total > 0 
        THEN (busy::float / total::float * 100) 
        ELSE 0 
      END as percent
    FROM (
      SELECT
        time_bucket(${window}::interval, time) as bucket,
        AVG(busy) as busy,
        AVG(total) as total
      FROM ae_crafting_cpu
      WHERE time >= NOW() - ${interval}::interval
      GROUP BY bucket
    ) stats
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.percent) || 0,
  }));
}
