/**
 * Named Flux query builders for the MC telemetry bucket.
 *
 * Range notes:
 *  - "current state" queries use -24h so the dashboard always shows the last
 *    known snapshot even if a collector node is temporarily offline.
 *  - History/graph queries keep their proper windowed ranges.
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
  |> range(start: -24h)
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
  |> range(start: -24h)
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
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
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
    fluids_unique: (r.fluids_unique as number) ?? 0,
    chemicals_total: (r.chemicals_total as number) ?? 0,
    chemicals_unique: (r.chemicals_unique as number) ?? 0,
    item_storage_used: (r.item_storage_used as number) ?? 0,
    item_storage_total: (r.item_storage_total as number) ?? 0,
    fluid_storage_used: (r.fluid_storage_used as number) ?? 0,
    fluid_storage_total: (r.fluid_storage_total as number) ?? 0,
    chemical_storage_used: (r.chemical_storage_used as number) ?? 0,
    chemical_storage_total: (r.chemical_storage_total as number) ?? 0,
    energy_usage: (r.energy_usage as number) ?? 0,
    energy_input: (r.energy_input as number) ?? 0,
    energy_stored: (r.energy_stored as number) ?? 0,
    energy_capacity: (r.energy_capacity as number) ?? 0,
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
  |> range(start: -24h)
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
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "ae_crafting_cpu")
  |> last()
  |> pivot(rowKey: ["_time", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "ae_cpu")
  |> filter(fn: (r) => exists r.cpu_index)
  |> group(columns: ["cpu", "cpu_index", "node", "source", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "cpu", "cpu_index", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
`),
  ]);

  const s = summaryRows[0];
  const total = (s?.total as number) ?? 0;
  const busy = (s?.busy as number) ?? 0;

  const cpus = perCpuRows.map(r => {
    const cpuName = String(r.cpu ?? 'unnamed');
    const idx = r.cpu_index != null ? String(r.cpu_index) : null;
    // When CPUs are all unnamed, show "CPU N" using the index tag
    const displayName = (cpuName.toLowerCase() === 'unnamed' && idx) ? `CPU ${idx}` : cpuName;
    return {
      name: displayName,
      storage: (r.storage as number) ?? 0,
      coProcessors: (r.co_processors as number) ?? 0,
      busy: (r.is_busy as number) > 0,
    };
  });

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
  cpu_index: number;
  quantity: number;
  crafted: number;
  completion: number;       // 0-100, may be estimated
  is_estimated: boolean;    // true = completion derived from item-count delta
  elapsed_s: number;        // seconds since job was first seen by collector
  job_start_ms: number;     // epoch ms when job was first seen
}

export async function craftingJobs(): Promise<CraftingJob[]> {
  // ae_crafting_job is written every AE poll cycle (~60s) while a job is running.
  // Use a 10-cycle window (10m) to tolerate collector restarts / timing jitter.
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -10m)
  |> filter(fn: (r) => r._measurement == "ae_crafting_job")
  |> filter(fn: (r) => exists r.cpu_index)
  |> group(columns: ["item", "cpu", "cpu_index", "node", "source", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "item", "cpu", "cpu_index", "node"], columnKey: ["_field"], valueColumn: "_value")
  |> filter(fn: (r) => r.completion < 100)
`);

  const nowMs = Date.now();

  return rows.map(r => {
    const cpuName = String(r.cpu ?? 'unnamed');
    const idx = r.cpu_index != null ? Number(r.cpu_index) : 0;
    const displayCpu = cpuName.toLowerCase() === 'unnamed' ? `CPU ${idx}` : cpuName;
    const jobStartMs = (r.job_start_ms as number) ?? 0;
    const elapsedS = jobStartMs > 0 ? Math.floor((nowMs - jobStartMs) / 1000) : 0;
    return {
      item: String(r.item ?? ''),
      cpu: displayCpu,
      cpu_index: idx,
      quantity: (r.quantity as number) ?? 0,
      crafted: (r.crafted as number) ?? 0,
      completion: (r.completion as number) ?? 0,
      is_estimated: ((r.is_estimated as number) ?? 0) > 0,
      elapsed_s: elapsedS,
      job_start_ms: jobStartMs,
    };
  });
}
