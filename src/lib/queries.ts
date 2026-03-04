/**
 * Named Flux query builders for the MC telemetry bucket.
 *
 * Range notes:
 *  - energy/machines poll every 5s → use -2m
 *  - AE polls every 60s (slow: 600s) → use -15m to tolerate slow-AE cycles
 */

import { queryFlux, INFLUX_BUCKET } from './influx';

// ── Energy ────────────────────────────────────────────────────────────────────

export interface EnergySummary {
  stored_fe: number;
  capacity_fe: number;
  percent: number;
}

export async function energySummary(): Promise<EnergySummary | null> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "energy_total")
  |> filter(fn: (r) => r._field == "stored_fe" or r._field == "capacity_fe" or r._field == "percent")
  |> last()
  |> pivot(rowKey: ["_time", "node"], columnKey: ["_field"], valueColumn: "_value")
`);
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    stored_fe: (r.stored_fe as number) ?? 0,
    capacity_fe: (r.capacity_fe as number) ?? 0,
    percent: (r.percent as number) ?? 0,
  };
}

export interface EnergyFlow {
  name: string;
  rate_fe_t: number;
}

export async function energyFlow(): Promise<EnergyFlow[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "energy_flow" and r._field == "rate_fe_t")
  |> last()
`);
  return rows.map(r => ({
    name: String(r.name ?? ''),
    rate_fe_t: (r._value as number) ?? 0,
  }));
}

export interface TimePoint {
  time: string;
  value: number;
}

export async function energyHistory(range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_total" and r._field == "percent")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
  }));
}

export async function energyFlowHistory(range = '-1h'): Promise<{ time: string; value: number; name: string }[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_flow" and r._field == "rate_fe_t")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
    name: String(r.name ?? ''),
  }));
}

// ── AE2 ───────────────────────────────────────────────────────────────────────

export interface AESummary {
  items_total: number;
  items_unique: number;
  fluids_total: number;
  item_storage_used: number;
  item_storage_total: number;
  energy_usage: number;
  energy_input: number;
}

export async function aeSummary(): Promise<AESummary | null> {
  // AE polls every 60s; allow up to 15m for slow-AE cycles
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -15m)
  |> filter(fn: (r) => r._measurement == "ae_summary")
  |> last()
  |> pivot(rowKey: ["_time", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
`);
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    items_total: (r.items_total as number) ?? 0,
    items_unique: (r.items_unique as number) ?? 0,
    fluids_total: (r.fluids_total as number) ?? 0,
    item_storage_used: (r.item_storage_used as number) ?? 0,
    item_storage_total: (r.item_storage_total as number) ?? 0,
    energy_usage: (r.energy_usage as number) ?? 0,
    energy_input: (r.energy_input as number) ?? 0,
  };
}

export interface AEItem {
  item: string;
  count: number;
}

export async function aeItems(filter?: string): Promise<AEItem[]> {
  const importClause = filter ? 'import "strings"\n' : '';
  const filterClause = filter
    ? `  |> filter(fn: (r) => strings.containsStr(v: strings.toLower(v: r.item), substr: "${filter.toLowerCase()}"))\n`
    : '';

  const rows = await queryFlux(`
${importClause}from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -15m)
  |> filter(fn: (r) => r._measurement == "ae_item" and r._field == "count")
  |> last()
${filterClause}  |> sort(columns: ["_value"], desc: true)
  |> limit(n: 500)
`);
  return rows.map(r => ({
    item: String(r.item ?? ''),
    count: (r._value as number) ?? 0,
  }));
}

export async function aeItemHistory(item: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_item" and r._field == "count" and r.item == "${item}")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
  }));
}

export interface AECPUs {
  total: number;
  busy: number;
  busy_percent: number;
  // Per-CPU detail
  cpus: { name: string; storage: number; coProcessors: number; busy: boolean }[];
}

export async function aeCPUs(): Promise<AECPUs> {
  const [summaryRows, perCpuRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -15m)
  |> filter(fn: (r) => r._measurement == "ae_crafting_cpu")
  |> last()
  |> pivot(rowKey: ["_time", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -15m)
  |> filter(fn: (r) => r._measurement == "ae_cpu")
  |> last()
  |> pivot(rowKey: ["_time", "cpu", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
`),
  ]);

  const s = summaryRows[0];
  const total = (s?.total as number) ?? 0;
  const busy = (s?.busy as number) ?? 0;

  const cpus = perCpuRows.map(r => ({
    name: String(r.cpu ?? 'Unnamed'),
    storage: (r.storage as number) ?? 0,
    coProcessors: (r.co_processors as number) ?? 0,
    busy: (r.is_busy as number) > 0,
  }));

  return {
    total,
    busy,
    busy_percent: total > 0 ? (busy / total) * 100 : 0,
    cpus,
  };
}

// ── Machines ──────────────────────────────────────────────────────────────────

export interface MachineSummary {
  total_machines: number;
  active_machines: number;
  active_percent: number;
}

export async function machineSummary(): Promise<MachineSummary | null> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "machine_summary")
  |> filter(fn: (r) => r._field == "total_machines" or r._field == "active_machines" or r._field == "active_percent")
  |> last()
  |> pivot(rowKey: ["_time", "node"], columnKey: ["_field"], valueColumn: "_value")
`);
  if (rows.length === 0) return null;
  const r = rows[0]!;
  return {
    total_machines: (r.total_machines as number) ?? 0,
    active_machines: (r.active_machines as number) ?? 0,
    active_percent: (r.active_percent as number) ?? 0,
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
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "machine_type")
  |> filter(fn: (r) => r._field == "total_count" or r._field == "active_count" or r._field == "active_percent")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> last()
  |> pivot(rowKey: ["_time", "node", "mod", "type"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows
    .map(r => ({
      type: String(r.type ?? ''),
      mod: String(r.mod ?? ''),
      total_count: (r.total_count as number) ?? 0,
      active_count: (r.active_count as number) ?? 0,
      active_percent: (r.active_percent as number) ?? 0,
    }))
    .sort((a, b) => b.active_count - a.active_count);
}

// Mekanism machines — have real active/progress/energy data
export interface MekanismMachine {
  name: string;
  type: string;
  node: string;
  active: boolean;
  energy_percent: number;       // 0-100
  progress: number;
  progress_total: number;
  progress_percent: number;     // 0-100
}

export async function mekanismMachines(): Promise<MekanismMachine[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "machine_activity" and r.mod == "mekanism")
  |> filter(fn: (r) => r.type != "me_bridge")
  |> last()
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

// MI machines — now have inferred_active field (derived from occupied slots + energy)
export interface MIMachine {
  name: string;
  type: string;
  node: string;
  active: boolean;           // inferred_active (for MI) or native active (fallback)
  energy_percent: number;    // 0-100
  occupied_slots?: number;
  total_slots?: number;
}

export async function miMachines(): Promise<MIMachine[]> {
  // Fetch machine_activity with inferred_active + energy_percent
  const [activityRows, slotRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "machine_activity" and r.mod == "modern_industrialization")
  |> last()
  |> pivot(rowKey: ["_time", "name", "type", "mod", "node"], columnKey: ["_field"], valueColumn: "_value")
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -1m)
  |> filter(fn: (r) => r._measurement == "mi_machine_slot_summary")
  |> last()
  |> pivot(rowKey: ["_time", "name", "type", "node"], columnKey: ["_field"], valueColumn: "_value")
`),
  ]);

  // Build slot map keyed by machine name
  const slotMap = new Map<string, { occupied: number; total: number }>();
  for (const r of slotRows) {
    const name = String(r.name ?? '');
    slotMap.set(name, {
      occupied: (r.occupied as number) ?? 0,
      total: (r.slots as number) ?? 0,
    });
  }

  return activityRows
    .map(r => {
      const name = String(r.name ?? '');
      const slot = slotMap.get(name);
      return {
        name,
        type: String(r.type ?? ''),
        node: String(r.node ?? ''),
        active: (r.inferred_active as number) > 0,
        energy_percent: (r.energy_percent as number) ?? 0,
        occupied_slots: slot?.occupied,
        total_slots: slot?.total,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.type.localeCompare(b.type));
}

export interface MIMachineGroup {
  type: string;        // e.g. "modern_industrialization:assembler"
  label: string;       // short label without mod prefix
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

// MI machine fluids — latest levels per tank
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
  |> range(start: -1m)
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

export interface ItemVelocity {
  item: string;
  delta: number;      // positive = net gain, negative = net loss
  first: number;
  last: number;
}

/** Top items by absolute delta over the last N minutes (default 30m). */
export async function aeItemVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  // We need first AND last per item — run two queries and diff
  const [firstRows, lastRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_item" and r._field == "count")
  |> first()
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_item" and r._field == "count")
  |> last()
`),
  ]);

  const firstMap = new Map<string, number>();
  for (const r of firstRows) firstMap.set(String(r.item ?? ''), (r._value as number) ?? 0);

  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.item ?? '');
    const last = (r._value as number) ?? 0;
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

// ── Crafting ──────────────────────────────────────────────────────────────────

export interface CraftingJob {
  item: string;
  cpu: string;
  quantity: number;
  crafted: number;
  completion: number;
}

export async function craftingJobs(): Promise<CraftingJob[]> {
  // ae_crafting_job only exists while a job is running — look back 2m
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -2m)
  |> filter(fn: (r) => r._measurement == "ae_crafting_job")
  |> last()
  |> pivot(rowKey: ["_time", "item", "cpu", "node"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows.map(r => ({
    item: String(r.item ?? ''),
    cpu: String(r.cpu ?? ''),
    quantity: (r.quantity as number) ?? 0,
    crafted: (r.crafted as number) ?? 0,
    completion: (r.completion as number) ?? 0,
  }));
}
