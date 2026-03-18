/**
 * Crafting telemetry queries.
 */

import { queryFlux, INFLUX_BUCKET } from '../influx';
import { type TimePoint, rangeToWindow, withHistoryFallback } from './shared';

export interface CraftingJob {
  item: string;
  cpu: string;
  cpu_index: number;
  quantity: number;
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
`);

  return rows.map(r => {
    const cpuName = String(r.cpu ?? 'unnamed');
    const idx = r.cpu_index != null ? Number(r.cpu_index) : 0;
    const displayCpu = cpuName.toLowerCase() === 'unnamed' ? `CPU ${idx}` : cpuName;
    return {
      item: String(r.item ?? ''),
      cpu: displayCpu,
      cpu_index: idx,
      quantity: (r.quantity as number) ?? 0,
    };
  });
}

export async function craftingTaskCount(): Promise<number> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -10m)
  |> filter(fn: (r) => r._measurement == "ae_crafting_task" and r._field == "count")
  |> last()
`);
  if (rows.length === 0) return 0;
  return (rows[0]?._value as number) ?? 0;
}

export async function craftingTaskHistory(range = '-1h'): Promise<TimePoint[]> {
  return withHistoryFallback(async (r) => {
    const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${r})
  |> filter(fn: (r) => r._measurement == "ae_crafting_task" and r._field == "count")
  |> aggregateWindow(every: ${rangeToWindow(r)}, fn: mean, createEmpty: false)
`);
    return rows.map(row => ({ time: String(row._time ?? ''), value: (row._value as number) ?? 0 }));
  }, range);
}

export async function craftingCpuHistory(range = '-1h'): Promise<TimePoint[]> {
  return withHistoryFallback(async (r) => {
    const window = rangeToWindow(r);
    const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${r})
  |> filter(fn: (r) => r._measurement == "ae_crafting_cpu" and (r._field == "busy" or r._field == "total"))
  |> aggregateWindow(every: ${window}, fn: last, createEmpty: false)
  |> pivot(rowKey: ["_time", "node", "source"], columnKey: ["_field"], valueColumn: "_value")
  |> map(fn: (r) => ({
      _time: r._time,
      _value: if r.total > 0 then float(v: r.busy) / float(v: r.total) * 100.0 else 0.0,
    }))
  |> group(columns: ["_time"])
  |> mean()
  |> group()
`);
    return rows.map(row => ({ time: String(row._time ?? ''), value: (row._value as number) ?? 0 }));
  }, range);
}
