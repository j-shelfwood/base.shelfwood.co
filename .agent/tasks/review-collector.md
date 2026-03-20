# Task: Review TimescaleDB Migration Plan — Lua Collector (mpm)

## Objective
Review the TimescaleDB migration plan against the actual CC:Tweaked Lua collector codebase. The collector currently POSTs InfluxDB line protocol directly to InfluxDB. Under the new plan it will POST to a Bun ingestion API that speaks the same protocol. Identify what (if anything) needs to change in the Lua code, and validate the schema inferred by the migration plan.

## Repo
`/Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/`

## Your Task

### 1. Discover the full collector codebase
```bash
tree /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Machines.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Energy.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/AE.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Influx.lua
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Main.lua
# Read any other .lua files in the directory
```

### 2. Extract the exact line protocol schema
For every `write()` or buffer push in the Lua code, extract the exact measurement name, tags, and fields being written. Format as a table:

| Measurement | Tags | Fields | Write frequency |
|-------------|------|--------|----------------|
| machine_activity | node, name, mod, type | active (bool→int) | 15s |
| ... | ... | ... | ... |

This is the ground truth for the TimescaleDB schema DDL.

### 3. Validate the migration plan's inferred schema
The migration plan inferred 8 measurements from dashboard queries:
- `machine_activity`, `machine_type`, `machine_summary`
- `mi_machine_slot`, `mi_machine_fluid`, `mi_machine_input`
- `energy_total`, `ae_item`

Check:
- Are these measurement names exactly correct?
- Are there additional measurements being written that the plan missed?
- Are the tag/field names correct? (case, underscores, etc.)
- Any measurements that are written but never queried by the dashboard?

### 4. Dual-write assessment
The plan proposes collectors POST to both InfluxDB AND the new ingestion API during the transition. Assess:
- How easy is it to add a second HTTP POST target in the current Lua code?
- Is there a single `Influx.write()` call or multiple?
- What's the config mechanism? Can we add a second URL via config?
- Suggest the minimal Lua change needed (or confirm zero changes needed if the ingestion API mirrors the InfluxDB write endpoint exactly)

### 5. Backfill script assessment
The plan includes a backfill script to move historical data from InfluxDB to TimescaleDB. Review if there are any edge cases in the data that would complicate parsing (unusual field types, sparse measurements, etc.).

## Output
Output a complete review directly in chat as structured markdown. Include:
- Complete ground-truth schema table (all measurements, tags, fields)
- Gaps between inferred schema and actual schema
- Dual-write Lua change (exact code if any change needed)
- Any data model concerns for the TimescaleDB DDL

Do NOT write to any files. Do NOT commit anything.
