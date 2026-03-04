import type { APIRoute } from 'astro';
import { energyHistory, energyFlowHistory } from '@/lib/queries';
import { queryFlux, INFLUX_BUCKET } from '@/lib/influx';

const ALLOWED_MEASUREMENTS = new Set([
  'energy_total', 'energy_flow', 'ae_summary', 'machine_summary',
]);

const ALLOWED_FIELDS = new Set([
  'percent', 'stored_fe', 'rate_fe_t', 'items_total', 'energy_usage',
  'total_machines', 'active_machines', 'active_percent',
]);

export const GET: APIRoute = async ({ url }) => {
  try {
    const m = url.searchParams.get('m') || '';
    const f = url.searchParams.get('f') || '';
    const r = url.searchParams.get('r') || '-1h';
    const window = url.searchParams.get('w') || '1m';

    // Validate against allowlist to prevent Flux injection
    if (!ALLOWED_MEASUREMENTS.has(m)) {
      return Response.json({ error: 'Invalid measurement' }, { status: 400 });
    }
    if (!ALLOWED_FIELDS.has(f)) {
      return Response.json({ error: 'Invalid field' }, { status: 400 });
    }
    if (!/^-\d+[smhd]$/.test(r)) {
      return Response.json({ error: 'Invalid range' }, { status: 400 });
    }
    if (!/^\d+[smhd]$/.test(window)) {
      return Response.json({ error: 'Invalid window' }, { status: 400 });
    }

    const rows = await queryFlux(`
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${r})
  |> filter(fn: (r) => r._measurement == "${m}" and r._field == "${f}")
  |> aggregateWindow(every: ${window}, fn: mean, createEmpty: false)
`);

    const data = rows.map(row => ({
      time: String(row._time ?? ''),
      value: (row._value as number) ?? 0,
      ...(row.name ? { name: String(row.name) } : {}),
    }));

    return Response.json({ data });
  } catch (err) {
    console.error('history API error', err);
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
};
