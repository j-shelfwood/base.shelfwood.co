/**
 * Server-only InfluxDB v2 Flux query client.
 * Uses the /api/v2/query endpoint with annotated CSV response format.
 * Never import this in client-side code — env vars with the token are server-only.
 */

const INFLUX_URL = import.meta.env.INFLUX_URL || process.env.INFLUX_URL || '';
const INFLUX_TOKEN = import.meta.env.INFLUX_TOKEN || process.env.INFLUX_TOKEN || '';
const INFLUX_ORG = import.meta.env.INFLUX_ORG || process.env.INFLUX_ORG || 'shelfwood';
export const INFLUX_BUCKET = import.meta.env.INFLUX_BUCKET || process.env.INFLUX_BUCKET || 'mc';

export type FluxRow = Record<string, string | number | boolean | null>;

/**
 * Parse InfluxDB annotated CSV response into an array of row objects.
 * InfluxDB returns multiple tables separated by empty lines.
 * Each table has #datatype, #group, #default annotation rows + a header row.
 */
function parseAnnotatedCSV(csv: string): FluxRow[] {
  const rows: FluxRow[] = [];
  // Split into table blocks on blank lines (CRLF or LF)
  const blocks = csv.split(/\r?\n\r?\n/);
  const seen = new Set<string>();

  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) continue;

    // Find optional #datatype annotation and the first non-comment header row
    const datatypeRow = lines.find(l => l.startsWith('#datatype'));
    const headerRow = lines.find(l => !l.startsWith('#'));
    if (!headerRow) continue;

    const blockKey = headerRow + (datatypeRow ?? '');
    if (seen.has(blockKey)) continue;
    seen.add(blockKey);

    // Types from #datatype if present; fall back to auto-detection via parseFloat
    const types = datatypeRow
      ? datatypeRow.replace('#datatype,', '').split(',')
      : [];

    const headers = headerRow.split(',');
    const dataLines = lines.filter(l => !l.startsWith('#') && l !== headerRow);

    for (const line of dataLines) {
      if (!line.trim()) continue;
      const values = line.split(',');
      const row: FluxRow = {};

      for (let i = 0; i < headers.length; i++) {
        const key = headers[i]?.trim();
        const val = values[i]?.trim() ?? '';
        const type = types[i]?.trim() ?? '';

        if (!key || key === '' || key === 'result' || key === 'table') continue;

        if (val === '' || val === 'null') {
          row[key] = null;
        } else if (type === 'long' || type === 'unsignedLong' || type === 'double') {
          row[key] = parseFloat(val);
        } else if (type === 'boolean') {
          row[key] = val === 'true';
        } else {
          // No type annotation — try numeric coercion, keep string otherwise
          const n = parseFloat(val);
          row[key] = !isNaN(n) && val.trim() !== '' && !/[a-zA-Z]/.test(val.trim()) ? n : val;
        }
      }

      if (Object.keys(row).length > 0) {
        rows.push(row);
      }
    }
  }

  return rows;
}

/**
 * Execute a Flux query against InfluxDB and return parsed rows.
 * Throws if configuration is missing or the request fails.
 */
export async function queryFlux(fluxQuery: string): Promise<FluxRow[]> {
  if (!INFLUX_URL || !INFLUX_TOKEN) {
    throw new Error('InfluxDB not configured: set INFLUX_URL and INFLUX_TOKEN env vars');
  }

  const url = `${INFLUX_URL.replace(/\/+$/, '')}/api/v2/query?org=${encodeURIComponent(INFLUX_ORG)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${INFLUX_TOKEN}`,
      'Content-Type': 'application/vnd.flux',
      'Accept': 'application/csv',
    },
    body: fluxQuery,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`InfluxDB query failed (${response.status}): ${text}`);
  }

  const csv = await response.text();
  return parseAnnotatedCSV(csv);
}

/**
 * Helper: get the most recent value of a field from a measurement.
 * Returns null if no data.
 */
export async function queryLast(
  measurement: string,
  field: string,
  tags?: Record<string, string>,
  range = '-5m'
): Promise<number | null> {
  const tagFilters = tags
    ? Object.entries(tags)
        .map(([k, v]) => `  |> filter(fn: (r) => r.${k} == "${v}")`)
        .join('\n')
    : '';

  const query = `
from(bucket: "${INFLUX_BUCKET}")
  |> range(start: ${range})
  |> filter(fn: (r) => r._measurement == "${measurement}" and r._field == "${field}")
${tagFilters}
  |> last()
`;

  const rows = await queryFlux(query);
  if (rows.length === 0) return null;
  const val = rows[0]?._value;
  return typeof val === 'number' ? val : null;
}
