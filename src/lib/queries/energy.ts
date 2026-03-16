/**
 * Energy telemetry queries.
 */

import { queryFlux, INFLUX_BUCKET } from '../influx';
import { type TimePoint, rangeToWindow } from './shared';

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

export async function energyHistory(range = '-1h'): Promise<TimePoint[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_total" and r._field == "percent")
  |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
  }));
}

export async function energyFlowHistory(range = '-1h'): Promise<{ time: string; value: number; name: string }[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_flow" and r._field == "rate_fe_t")
  |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
    name: String(r.name ?? ''),
  }));
}

export async function energyStoredHistory(range = '-1h'): Promise<TimePoint[]> {
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_total" and r._field == "stored_fe")
  |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
  }));
}

export async function energyNetHistory(range = '-1h'): Promise<TimePoint[]> {
  // Total flow = sum of all energy_flow detector rates per time window
  const window = rangeToWindow(range);
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_flow" and r._field == "rate_fe_t")
  |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
  |> group(columns: ["_time"])
  |> reduce(
      identity: {net: 0.0, count: 0},
      fn: (r, accumulator) => ({
        net: accumulator.net + r._value,
        count: accumulator.count + 1,
      })
    )
  |> map(fn: (r) => ({ r with _value: r.net, _field: "net_fe_t" }))
  |> group()
`);
  return rows.map(r => ({
    time: String(r._time ?? ''),
    value: (r._value as number) ?? 0,
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
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r._measurement == "energy_storage")
  |> filter(fn: (r) => r._field == "stored_fe" or r._field == "capacity_fe" or r._field == "percent")
  |> group(columns: ["name", "type", "storage", "node", "_field"])
  |> last()
  |> group()
  |> pivot(rowKey: ["_time", "name", "type", "storage", "node"], columnKey: ["_field"], valueColumn: "_value")
`);
  return rows.map(r => ({
    name: String(r.name ?? ''),
    type: String(r.type ?? ''),
    storage: String(r.storage ?? ''),
    stored_fe: (r.stored_fe as number) ?? 0,
    capacity_fe: (r.capacity_fe as number) ?? 0,
    percent: (r.percent as number) ?? 0,
  })).sort((a, b) => b.capacity_fe - a.capacity_fe);
}

export async function energyDeviceHistory(name: string, range = '-1h'): Promise<TimePoint[]> {
  const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "energy_storage" and r._field == "percent" and r.name == "${name}")
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
`);
  return rows.map(r => ({ time: String(r._time ?? ''), value: (r._value as number) ?? 0 }));
}
