/**
 * Applied Energistics 2 telemetry queries (TimescaleDB/SQL).
 */

import { sql } from '../db';
import { type TimePoint, type ItemVelocity, parseRangeInterval, rangeToWindow } from './shared';

export interface AESummary {
  items_total: number;
  items_unique: number;
  fluids_total: number;
  fluids_unique: number;
  chemicals_total: number;
  chemicals_unique: number;
  item_storage_used: number;
  item_storage_total: number;
  fluid_storage_used: number;
  fluid_storage_total: number;
  chemical_storage_used: number;
  chemical_storage_total: number;
  energy_usage: number;
  energy_input: number;
  energy_stored: number;
  energy_capacity: number;
}

export async function aeSummary(): Promise<AESummary | null> {
  const rows = await sql`
    SELECT DISTINCT ON (node, source)
      node,
      source,
      items as items_total,
      types as items_unique,
      fluids as fluids_total,
      0 as fluids_unique,
      chemicals as chemicals_total,
      0 as chemicals_unique,
      0 as item_storage_used,
      0 as item_storage_total,
      0 as fluid_storage_used,
      0 as fluid_storage_total,
      0 as chemical_storage_used,
      0 as chemical_storage_total,
      0 as energy_usage,
      0 as energy_input,
      0 as energy_stored,
      0 as energy_capacity
    FROM ae_summary
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, source, time DESC
    LIMIT 1
  `;
  
  if (rows.length === 0) return null;
  const r = rows[0]!;
  
  return {
    items_total: Number(r.items_total) || 0,
    items_unique: Number(r.items_unique) || 0,
    fluids_total: Number(r.fluids_total) || 0,
    fluids_unique: Number(r.fluids_unique) || 0,
    chemicals_total: Number(r.chemicals_total) || 0,
    chemicals_unique: Number(r.chemicals_unique) || 0,
    item_storage_used: Number(r.item_storage_used) || 0,
    item_storage_total: Number(r.item_storage_total) || 0,
    fluid_storage_used: Number(r.fluid_storage_used) || 0,
    fluid_storage_total: Number(r.fluid_storage_total) || 0,
    chemical_storage_used: Number(r.chemical_storage_used) || 0,
    chemical_storage_total: Number(r.chemical_storage_total) || 0,
    energy_usage: Number(r.energy_usage) || 0,
    energy_input: Number(r.energy_input) || 0,
    energy_stored: Number(r.energy_stored) || 0,
    energy_capacity: Number(r.energy_capacity) || 0,
  };
}

export async function aeSummaryHistory(
  field: 'items_total' | 'energy_usage' | 'item_storage_used' | 'fluids_total' | 'chemicals_total' | 'fluid_storage_used' | 'chemical_storage_used',
  range = '-1h'
): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  // Map field names to actual column names in ae_summary table
  const columnMap: Record<string, string> = {
    items_total: 'items',
    energy_usage: 'items', // Default fallback, may need adjustment
    item_storage_used: 'items',
    fluids_total: 'fluids',
    chemicals_total: 'chemicals',
    fluid_storage_used: 'fluids',
    chemical_storage_used: 'chemicals',
  };
  
  const column = columnMap[field] || 'items';
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      SUM(${sql(column)}) as total
    FROM ae_summary
    WHERE time >= NOW() - ${interval}::interval
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.total) || 0,
  }));
}

export interface AEItem {
  item: string;
  count: number;
}

export async function aeItems(filter?: string): Promise<AEItem[]> {
  const rows = filter
    ? await sql`
        SELECT DISTINCT ON (node, item)
          node,
          item,
          count
        FROM ae_item
        WHERE time >= NOW() - INTERVAL '24 hours'
          AND LOWER(item) LIKE ${`%${filter.toLowerCase()}%`}
        ORDER BY node, item, time DESC
        LIMIT 500
      `
    : await sql`
        SELECT DISTINCT ON (node, item)
          node,
          item,
          count
        FROM ae_item
        WHERE time >= NOW() - INTERVAL '24 hours'
        ORDER BY node, item, time DESC
        LIMIT 500
      `;
  
  return rows
    .map(r => ({
      item: String(r.item),
      count: Number(r.count) || 0,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function aeItemHistory(item: string, range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  
  const rows = await sql`
    SELECT 
      time_bucket('5 minutes'::interval, time) as bucket,
      AVG(count) as avg_count
    FROM ae_item
    WHERE time >= NOW() - ${interval}::interval
      AND item = ${item}
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_count) || 0,
  }));
}

export async function aeItemVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  const interval = parseRangeInterval(range);
  
  const [firstRows, lastRows] = await Promise.all([
    sql`
      SELECT DISTINCT ON (item)
        item,
        count as first_count,
        time
      FROM ae_item
      WHERE time >= NOW() - ${interval}::interval
      ORDER BY item, time ASC
    `,
    sql`
      SELECT DISTINCT ON (item)
        item,
        count as last_count
      FROM ae_item
      WHERE time >= NOW() - ${interval}::interval
      ORDER BY item, time DESC
    `,
  ]);

  const firstMap = new Map<string, number>();
  for (const r of firstRows) {
    firstMap.set(String(r.item), Number(r.first_count) || 0);
  }

  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.item);
    const last = Number(r.last_count) || 0;
    const first = firstMap.get(item) ?? last;
    const delta = last - first;
    if (Math.abs(delta) > 0) {
      results.push({ item, delta, first, last });
    }
  }

  return results
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

export interface AECPUs {
  total: number;
  busy: number;
  busy_percent: number;
  cpus: { name: string; storage: number; coProcessors: number; busy: boolean }[];
}

export async function aeCPUs(): Promise<AECPUs> {
  const rows = await sql`
    SELECT DISTINCT ON (node, source)
      node,
      source,
      cpu_total as total,
      cpu_busy as busy
    FROM ae_summary
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, source, time DESC
  `;

  const total = rows.length > 0 ? (Number(rows[0]?.total) || 0) : 0;
  const busy = rows.length > 0 ? (Number(rows[0]?.busy) || 0) : 0;

  return {
    total,
    busy,
    busy_percent: total > 0 ? (busy / total) * 100 : 0,
    cpus: [],
  };
}

export interface AEFluid {
  fluid: string;
  amount: number;
}

export async function aeFluids(): Promise<AEFluid[]> {
  const rows = await sql`
    SELECT DISTINCT ON (node, fluid)
      node,
      fluid,
      amount
    FROM ae_fluid
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, fluid, time DESC
  `;
  
  return rows
    .map(r => ({
      fluid: String(r.fluid),
      amount: Number(r.amount) || 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export async function aeFluidHistory(fluid: string, range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  
  const rows = await sql`
    SELECT 
      time_bucket('5 minutes'::interval, time) as bucket,
      AVG(amount) as avg_amount
    FROM ae_fluid
    WHERE time >= NOW() - ${interval}::interval
      AND fluid = ${fluid}
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.avg_amount) || 0,
  }));
}

export async function aeFluidVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  const interval = parseRangeInterval(range);
  
  const [firstRows, lastRows] = await Promise.all([
    sql`
      SELECT DISTINCT ON (fluid)
        fluid,
        amount as first_amount
      FROM ae_fluid
      WHERE time >= NOW() - ${interval}::interval
      ORDER BY fluid, time ASC
    `,
    sql`
      SELECT DISTINCT ON (fluid)
        fluid,
        amount as last_amount
      FROM ae_fluid
      WHERE time >= NOW() - ${interval}::interval
      ORDER BY fluid, time DESC
    `,
  ]);
  
  const firstMap = new Map<string, number>();
  for (const r of firstRows) {
    firstMap.set(String(r.fluid), Number(r.first_amount) || 0);
  }
  
  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.fluid);
    const last = Number(r.last_amount) || 0;
    const first = firstMap.get(item) ?? last;
    const delta = last - first;
    if (Math.abs(delta) > 0) {
      results.push({ item, delta, first, last });
    }
  }
  
  return results
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

export interface AEChemical {
  chemical: string;
  amount: number;
}

export async function aeChemicals(): Promise<AEChemical[]> {
  // Note: ae_chemical table doesn't exist in schema, return empty array
  return [];
}

export async function aeChemicalHistory(chemical: string, range = '-1h'): Promise<TimePoint[]> {
  // Note: ae_chemical table doesn't exist in schema, return empty array
  return [];
}

export async function aeChemicalVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  // Note: ae_chemical table doesn't exist in schema, return empty array
  return [];
}
