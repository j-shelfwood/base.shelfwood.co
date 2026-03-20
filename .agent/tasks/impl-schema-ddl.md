# Task: Write TimescaleDB Schema DDL

## Objective
Create a complete SQL schema file at `/Users/shelfwood/Projects/mc-ingest/sql/schema.sql` for the TimescaleDB migration. This covers all measurements actually written by the CC:Tweaked Lua collector.

## Source of Truth
Read the collector files to verify measurement names and fields:
```bash
ls /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Machines.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Energy.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/AE.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Inventory.lua 2>/dev/null || true
```

## Schema Requirements

### Core measurements to cover (minimum):
1. `machine_activity` — per-machine active/progress state
2. `machine_type` — count of machines per type per node
3. `machine_summary` — active/total counts per node
4. `mi_machine_slot` — MI machine item slots
5. `mi_machine_fluid` — MI machine fluid tanks
6. `mi_machine_input` — MI machine input slots
7. `energy_total` — total energy per node (eu/rf/j)
8. `energy_storage` — per-device energy storage
9. `energy_flow` — energy flow rates
10. `ae_item` — AE2 item counts
11. `ae_fluid` — AE2 fluid amounts
12. `ae_cpu` — AE2 crafting CPUs
13. `ae_job` — AE2 active crafting jobs
14. `ae_summary` — AE2 network summary

### For each table:
- `time TIMESTAMPTZ NOT NULL` — primary time column
- Tag columns as `TEXT` (node, name, mod, type, item, fluid, etc.)
- Field columns as appropriate type (INTEGER, DOUBLE PRECISION, BOOLEAN)
- `SELECT create_hypertable('table_name', 'time', if_not_exists => TRUE)`
- Chunk interval: `chunk_time_interval => INTERVAL '1 week'` for most, `'1 day'` for high-write (machine_activity, energy_total)
- Add retention policy: `SELECT add_retention_policy('table_name', INTERVAL '30 days', if_not_exists => TRUE)`
- Add compression: `ALTER TABLE table_name SET (timescaledb.compress, timescaledb.compress_orderby = 'time DESC', timescaledb.compress_segmentby = 'node')`
- `SELECT add_compression_policy('table_name', INTERVAL '7 days', if_not_exists => TRUE)`
- Indexes: `CREATE INDEX IF NOT EXISTS ON table_name (node, time DESC)`
- For ae_item/ae_fluid: also index on item/fluid column

### Extension and DB setup (at top of file):
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

## Also create: `/Users/shelfwood/Projects/mc-ingest/sql/seed.sql`
A small seed file with test data for verifying the schema works:
```sql
-- Test inserts for each table
INSERT INTO energy_total (time, node, eu, rf) VALUES (NOW(), 'cc-58', 12345, 49380);
-- etc.
```

## Output
1. Create the directory `/Users/shelfwood/Projects/mc-ingest/sql/` if it doesn't exist
2. Write `schema.sql` with the full DDL
3. Write `seed.sql` with test inserts
4. Output a summary in chat listing each table, its columns, and chunk interval

Do NOT commit anything. Do NOT modify any existing files outside `/Users/shelfwood/Projects/mc-ingest/`.
