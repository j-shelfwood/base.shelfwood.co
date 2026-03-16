/**
 * Applied Energistics 2 telemetry queries.
 */

import { queryFlux, INFLUX_BUCKET } from '../influx';
import { type TimePoint, type ItemVelocity, rangeToWindow } from './shared';

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

export async function aeSummaryHistory(
  field: 'items_total' | 'energy_usage' | 'item_storage_used' | 'fluids_total' | 'chemicals_total' | 'fluid_storage_used' | 'chemical_storage_used',
  range = '-1h'
): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_summary" and r._field == "${field}")
  |> group(columns: ["node", "_field"])
  |> aggregateWindow(every: ${rangeToWindow(range)}, fn: last, createEmpty: false)
  |> group(columns: ["_time"])
  |> sum()
  |> group()
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
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

export async function aeItemVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
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

export interface AECPUs {
  total: number;
  busy: number;
  busy_percent: number;
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

export interface AEFluid {
  fluid: string;
  amount: number;
}

export async function aeFluids(): Promise<AEFluid[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount")
  |> last()
  |> sort(columns: ["_value"], desc: true)
`);
  return rows.map(r => ({
    fluid: String(r.fluid ?? ''),
    amount: (r._value as number) ?? 0,
  }));
}

export async function aeFluidHistory(fluid: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount" and r.fluid == "${fluid}")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

export async function aeFluidVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  const [firstRows, lastRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount")
  |> first()
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_fluid" and r._field == "amount")
  |> last()
`),
  ]);
  const firstMap = new Map<string, number>();
  for (const r of firstRows) firstMap.set(String(r.fluid ?? ''), (r._value as number) ?? 0);
  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.fluid ?? '');
    const last = (r._value as number) ?? 0;
    const first = firstMap.get(item) ?? last;
    const delta = last - first;
    if (Math.abs(delta) > 0) results.push({ item, delta, first, last });
  }
  return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}

export interface AEChemical {
  chemical: string;
  amount: number;
}

export async function aeChemicals(): Promise<AEChemical[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount")
  |> last()
  |> sort(columns: ["_value"], desc: true)
`);
  return rows.map(r => ({
    chemical: String(r.chemical ?? ''),
    amount: (r._value as number) ?? 0,
  }));
}

export async function aeChemicalHistory(chemical: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount" and r.chemical == "${chemical}")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}

export async function aeChemicalVelocity(range = '-30m', limit = 15): Promise<ItemVelocity[]> {
  const [firstRows, lastRows] = await Promise.all([
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount")
  |> first()
`),
    queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "ae_chemical" and r._field == "amount")
  |> last()
`),
  ]);
  const firstMap = new Map<string, number>();
  for (const r of firstRows) firstMap.set(String(r.chemical ?? ''), (r._value as number) ?? 0);
  const results: ItemVelocity[] = [];
  for (const r of lastRows) {
    const item = String(r.chemical ?? '');
    const last = (r._value as number) ?? 0;
    const first = firstMap.get(item) ?? last;
    const delta = last - first;
    if (Math.abs(delta) > 0) results.push({ item, delta, first, last });
  }
  return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}
