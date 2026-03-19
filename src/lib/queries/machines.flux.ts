/**
 * Machine telemetry queries.
 */

import { queryFlux, INFLUX_BUCKET } from '../influx';
import { type TimePoint, rangeToWindow, withHistoryFallback } from './shared';

export interface MachineSummary {
  total_machines: number;
  active_machines: number;
  active_percent: number;
}

export async function machineSummary(): Promise<MachineSummary | null> {
  // Group by node+field before last() so all collector nodes contribute.
  // Then sum total/active across nodes and derive percent.
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "machine_summary")
  |> filter(fn: (r) => r._field == "total_machines" or r._field == "active_machines")
  |> group(columns: ["node", "_field"])
  |> last()
  |> group(columns: ["_field"])
  |> sum()
`);
  if (rows.length === 0) return null;
  let total = 0;
  let active = 0;
  for (const r of rows) {
    if (r._field === 'total_machines')  total  = (r._value as number) ?? 0;
    if (r._field === 'active_machines') active = (r._value as number) ?? 0;
  }
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
  // Group by node+type+mod+field so each node's last snapshot is independent,
  // then pivot and compute active_percent in TS.
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "machine_type")
  |> filter(fn: (r) => r._field == "total_count" or r._field == "active_count")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> group(columns: ["node", "mod", "type", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "node", "mod", "type"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows
    .map(r => {
      const total  = (r.total_count  as number) ?? 0;
      const active = (r.active_count as number) ?? 0;
      return {
        type: String(r.type ?? ''),
        mod: String(r.mod ?? ''),
        total_count: total,
        active_count: active,
        active_percent: total > 0 ? (active / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.active_count - a.active_count);
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
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "machine_activity" and r.mod == "mekanism")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> group(columns: ["name", "type", "mod", "node", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "name", "type", "mod", "node"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows
    .map(r => ({
      name: String(r.name ?? ''),
      type: String(r.type ?? ''),
      node: String(r.node ?? ''),
      active: (r.active as number) > 0,
      energy_percent: (r.energy_percent as number) ?? 0,
      progress: (r.progress as number) ?? 0,
      progress_total: (r.progress_total as number) ?? 0,
      progress_percent: (r.progress_percent as number) ?? 0,
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
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "machine_activity" and r.mod == "modern_industrialization")
  |> group(columns: ["name", "type", "mod", "node", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "name", "type", "mod", "node"], columnKey: ["_field"], valueColumn: "_value")
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "mi_machine_slot_summary")
  |> group(columns: ["name", "type", "node", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "name", "type", "node"], columnKey: ["_field"], valueColumn: "_value")
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "mi_machine_input")
  |> group(columns: ["name", "type", "node", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "name", "type", "node", "item"], columnKey: ["_field"], valueColumn: "_value")
`),
  ]);

  const slotMap = new Map<string, { occupied: number; total: number }>();
  for (const r of slotRows) {
    const name = String(r.name ?? '');
    slotMap.set(name, {
      occupied: (r.occupied as number) ?? 0,
      total: (r.slots as number) ?? 0,
    });
  }

  const inputMap = new Map<string, { item: string; display?: string }>();
  for (const r of inputRows) {
    const name = String(r.name ?? '');
    inputMap.set(name, {
      item: String(r.item ?? ''),
      display: r.display_name ? String(r.display_name) : undefined,
    });
  }

  return activityRows
    .map(r => {
      const name = String(r.name ?? '');
      const slot = slotMap.get(name);
      const input = inputMap.get(name);
      const inferredActive = (r.inferred_active as number) > 0;
      const slotActive = (slot?.occupied ?? 0) > 0;
      return {
        name,
        type: String(r.type ?? ''),
        node: String(r.node ?? ''),
        active: inferredActive || slotActive,
        energy_percent: (r.energy_percent as number) ?? 0,
        occupied_slots: slot?.occupied,
        total_slots: slot?.total,
        input_item: input?.item,
        input_display: input?.display,
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
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "mi_machine_fluid")
  |> last()
  |> pivot(rowKey: ["_time", "name", "type", "node", "fluid"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows.map(r => ({
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    fluid: String(r.fluid ?? ''),
    amount: (r.amount as number) ?? 0,
    capacity: (r.capacity as number) ?? 0,
    percent: (r.percent as number) ?? 0,
  }));
}

export interface MISlotItem {
  name: string;
  item: string;
  count: number;
}

export async function miMachineSlotItems(): Promise<MISlotItem[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "mi_machine_slot" and r._field == "count")
  |> group(columns: ["name", "item", "node"])
  |> last()
  |> group()
  |> sort(columns: ["_value"], desc: true)
`);
  return rows.map(r => ({
    name: String(r.name ?? ''),
    item: String(r.item ?? ''),
    count: (r._value as number) ?? 0,
  }));
}

export async function machineActivityHistory(range = '-1h'): Promise<TimePoint[]> {
  return withHistoryFallback(async (r) => {
    const window = rangeToWindow(r);
    const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${r})
  |> filter(fn: (r) => r._measurement == "machine_activity" and r._field == "active")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> group(columns: ["node", "name", "_field"])
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> filter(fn: (r) => r._value > 0)
  |> group(columns: ["_time"])
  |> count()
  |> group()
`);
    return rows.map(row => ({ time: String(row._time ?? ''), value: (row._value as number) ?? 0 }));
  }, range);
}

export async function machineActivePercentHistory(range = '-1h'): Promise<TimePoint[]> {
  return withHistoryFallback(async (r) => {
    const window = rangeToWindow(r);
    const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${r})
  |> filter(fn: (r) => r._measurement == "machine_activity" and r._field == "active")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> group(columns: ["node", "name", "_field"])
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> reduce(
      identity: {active: 0, total: 0},
      fn: (r, accumulator) => ({
        active: accumulator.active + (if r._value > 0 then 1 else 0),
        total: accumulator.total + 1,
      })
    )
  |> map(fn: (r) => ({
      _time: r._time,
      _value: if r.total > 0 then float(v: r.active) / float(v: r.total) * 100.0 else 0.0,
    }))
  |> group()
`);
    return rows.map(row => ({ time: String(row._time ?? ''), value: (row._value as number) ?? 0 }));
  }, range);
}

export async function machineTypeHistory(type: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "mekanism_machine" and r._field == "active" and r.type == "${type}")
  |> group(columns: ["node", "type", "_field"])
  |> aggregateWindow(every: ${rangeToWindow(range)}, fn: sum, createEmpty: false)
  |> group(columns: ["_time", "type"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

export async function modActivityHistory(mod: string, range = '-1h'): Promise<TimePoint[]> {
  return withHistoryFallback(async (r) => {
    const window = rangeToWindow(r);
    const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${r})
  |> filter(fn: (r) => r._measurement == "machine_activity" and r._field == "active" and r.mod == "${mod}")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> group(columns: ["node", "name", "_field"])
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> filter(fn: (r) => r._value > 0)
  |> group(columns: ["_time"])
  |> count()
  |> group()
`);
    return rows.map(row => ({ time: String(row._time ?? ''), value: (row._value as number) ?? 0 }));
  }, range);
}
