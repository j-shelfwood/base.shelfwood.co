/**
 * Machine telemetry queries (TimescaleDB/SQL).
 */

import { sql } from '../db';
import { type TimePoint, parseRangeInterval, rangeToWindow } from './shared';

export interface MachineSummary {
  total_machines: number;
  active_machines: number;
  active_percent: number;
}

export async function machineSummary(): Promise<MachineSummary | null> {
  const rows = await sql`
    SELECT
      SUM(total_machines) as total_machines,
      SUM(active_machines) as active_machines
    FROM (
      SELECT DISTINCT ON (node)
        node,
        total_machines,
        active_machines
      FROM machine_summary
      WHERE time >= NOW() - INTERVAL '24 hours'
      ORDER BY node, time DESC
    ) latest
  `;
  
  if (rows.length === 0 || rows[0] === undefined) return null;
  const total = Number(rows[0].total_machines) || 0;
  const active = Number(rows[0].active_machines) || 0;
  
  return {
    total_machines: total,
    active_machines: active,
    active_percent: total > 0 ? (active / total) * 100 : 0,
  };
}

export interface MachineType {
  type: string;
  mod: string;
  total_count: number;
  active_count: number;
  active_percent: number;
}

export async function machineTypes(): Promise<MachineType[]> {
  const rows = await sql`
    SELECT
      type,
      mod,
      SUM(total_count) as total_count,
      SUM(active_count) as active_count
    FROM (
      SELECT DISTINCT ON (node, mod, type)
        node,
        mod,
        type,
        total_count,
        active_count
      FROM machine_type
      WHERE time >= NOW() - INTERVAL '24 hours'
        AND type != 'me_bridge'
      ORDER BY node, mod, type, time DESC
    ) latest
    GROUP BY mod, type
    ORDER BY active_count DESC, type
  `;
  
  return rows.map(r => {
    const total = Number(r.total_count) || 0;
    const active = Number(r.active_count) || 0;
    return {
      type: String(r.type),
      mod: String(r.mod),
      total_count: total,
      active_count: active,
      active_percent: total > 0 ? (active / total) * 100 : 0,
    };
  });
}

export interface MekanismMachine {
  name: string;
  type: string;
  node: string;
  active: boolean;
  energy_percent: number;
  progress: number;
  progress_total: number;
  progress_percent: number;
}

export async function mekanismMachines(): Promise<MekanismMachine[]> {
  const rows = await sql`
    SELECT DISTINCT ON (node, name)
      node,
      name,
      type,
      mod,
      active,
      energy_percent,
      progress,
      progress_total,
      progress_percent
    FROM machine_activity
    WHERE time >= NOW() - INTERVAL '24 hours'
      AND mod = 'mekanism'
      AND type != 'me_bridge'
    ORDER BY node, name, time DESC
  `;
  
  return rows
    .map(r => ({
      name: String(r.name),
      type: String(r.type),
      node: String(r.node),
      active: Number(r.active) > 0 || r.inferred_active === true,
      energy_percent: Number(r.energy_percent) || 0,
      progress: Number(r.progress) || 0,
      progress_total: Number(r.progress_total) || 0,
      progress_percent: Number(r.progress_percent) || 0,
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.type.localeCompare(b.type));
}

export interface MIMachine {
  name: string;
  type: string;
  node: string;
  active: boolean;
  energy_percent: number;
  occupied_slots?: number;
  total_slots?: number;
  input_item?: string;
  input_display?: string;
}

export async function miMachines(): Promise<MIMachine[]> {
  const [activityRows, slotRows, inputRows] = await Promise.all([
    sql`
      SELECT DISTINCT ON (node, name)
        node,
        name,
        type,
        mod,
        active,
        energy_percent
      FROM machine_activity
      WHERE time >= NOW() - INTERVAL '24 hours'
        AND mod = 'modern_industrialization'
      ORDER BY node, name, time DESC
    `,
    sql`
      SELECT 
        name,
        COUNT(DISTINCT slot) FILTER (WHERE count > 0) as occupied,
        COUNT(DISTINCT slot) as total
      FROM (
        SELECT DISTINCT ON (node, name, slot)
          node,
          name,
          slot,
          count
        FROM mi_machine_slot
        WHERE time >= NOW() - INTERVAL '24 hours'
        ORDER BY node, name, slot, time DESC
      ) latest
      GROUP BY name
    `,
    sql`
      SELECT DISTINCT ON (node, name)
        node,
        name,
        item,
        count
      FROM mi_machine_input
      WHERE time >= NOW() - INTERVAL '24 hours'
      ORDER BY node, name, time DESC
    `,
  ]);

  const slotMap = new Map<string, { occupied: number; total: number }>();
  for (const r of slotRows) {
    slotMap.set(String(r.name), {
      occupied: Number(r.occupied) || 0,
      total: Number(r.total) || 0,
    });
  }

  const inputMap = new Map<string, { item: string }>();
  for (const r of inputRows) {
    inputMap.set(String(r.name), {
      item: String(r.item),
    });
  }

  return activityRows
    .map(r => {
      const name = String(r.name);
      const slot = slotMap.get(name);
      const input = inputMap.get(name);
      const inferredActive = Number(r.active) > 0;
      const slotActive = (slot?.occupied ?? 0) > 0;
      return {
        name,
        type: String(r.type),
        node: String(r.node),
        active: inferredActive || slotActive,
        energy_percent: Number(r.energy_percent) || 0,
        occupied_slots: slot?.occupied,
        total_slots: slot?.total,
        input_item: input?.item,
        input_display: undefined,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.type.localeCompare(b.type));
}

export interface MIMachineGroup {
  type: string;
  label: string;
  count: number;
  names: string[];
}

export async function miMachineGroups(): Promise<MIMachineGroup[]> {
  const machines = await miMachines();
  const groups: Record<string, { names: string[] }> = {};
  
  for (const m of machines) {
    if (!groups[m.type]) groups[m.type] = { names: [] };
    groups[m.type]!.names.push(m.name);
  }

  return Object.entries(groups)
    .map(([type, { names }]) => ({
      type,
      label: type.replace('modern_industrialization:', '').replace(/_/g, ' '),
      count: names.length,
      names: names.sort(),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface MIMachineFluid {
  name: string;
  type: string;
  fluid: string;
  amount: number;
  capacity: number;
  percent: number;
}

export async function miMachineFluids(): Promise<MIMachineFluid[]> {
  const rows = await sql`
    SELECT DISTINCT ON (node, name, fluid)
      name,
      mod as type,
      fluid,
      amount,
      capacity,
      CASE 
        WHEN capacity > 0 
        THEN (amount::float / capacity::float * 100) 
        ELSE 0 
      END as percent
    FROM mi_machine_fluid
    WHERE time >= NOW() - INTERVAL '24 hours'
    ORDER BY node, name, fluid, time DESC
  `;
  
  return rows.map(r => ({
    name: String(r.name),
    type: String(r.type),
    fluid: String(r.fluid),
    amount: Number(r.amount) || 0,
    capacity: Number(r.capacity) || 0,
    percent: Number(r.percent) || 0,
  }));
}

export interface MISlotItem {
  name: string;
  item: string;
  count: number;
}

export async function miMachineSlotItems(): Promise<MISlotItem[]> {
  const rows = await sql`
    SELECT 
      name,
      item,
      SUM(count) as total_count
    FROM (
      SELECT DISTINCT ON (node, name, slot)
        node,
        name,
        item,
        count
      FROM mi_machine_slot
      WHERE time >= NOW() - INTERVAL '24 hours'
      ORDER BY node, name, slot, time DESC
    ) latest
    GROUP BY name, item
    ORDER BY total_count DESC
  `;
  
  return rows.map(r => ({
    name: String(r.name),
    item: String(r.item),
    count: Number(r.total_count) || 0,
  }));
}

export async function machineActivityHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      COUNT(DISTINCT name) as active_count
    FROM machine_activity
    WHERE time >= NOW() - ${interval}::interval
      AND active = 1
      AND type != 'me_bridge'
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.active_count) || 0,
  }));
}

export async function machineActivePercentHistory(range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      bucket,
      CASE 
        WHEN total > 0 
        THEN (active::float / total::float * 100) 
        ELSE 0 
      END as percent
    FROM (
      SELECT 
        time_bucket(${window}::interval, time) as bucket,
        COUNT(DISTINCT name) FILTER (WHERE active = 1) as active,
        COUNT(DISTINCT name) as total
      FROM machine_activity
      WHERE time >= NOW() - ${interval}::interval
        AND type != 'me_bridge'
      GROUP BY bucket
    ) stats
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.percent) || 0,
  }));
}

export async function machineTypeHistory(type: string, range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      SUM(active) as active_count
    FROM machine_activity
    WHERE time >= NOW() - ${interval}::interval
      AND type = ${type}
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.active_count) || 0,
  }));
}

export async function modActivityHistory(mod: string, range = '-1h'): Promise<TimePoint[]> {
  const interval = parseRangeInterval(range);
  const window = rangeToWindow(range);
  
  const rows = await sql`
    SELECT 
      time_bucket(${window}::interval, time) as bucket,
      COUNT(DISTINCT name) as active_count
    FROM machine_activity
    WHERE time >= NOW() - ${interval}::interval
      AND mod = ${mod}
      AND active = 1
      AND type != 'me_bridge'
    GROUP BY bucket
    ORDER BY bucket
  `;
  
  return rows.map(r => ({
    time: new Date(r.bucket as Date).toISOString(),
    value: Number(r.active_count) || 0,
  }));
}
