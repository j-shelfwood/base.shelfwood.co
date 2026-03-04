# Task: Audit and update dashboard for collector schema changes

## Context

The influx-collector (CC:Tweaked Lua) has just been updated. Several InfluxDB measurements
changed. Your job is to read the existing dashboard pages and API routes, then make any
updates required to match the new schema. DO NOT speculate — read the files first.

## New / changed measurements

### 1. `machine_activity` — NEW field `inferred_active` (integer 0/1)
- Only present for `mod=modern_industrialization` series
- Derived from: `occupied input slots > 0 AND energy_eu > 0`
- The existing `active` field remains (always 0 for MI, correct for Mekanism)
- Dashboard should prefer `inferred_active` when `mod=modern_industrialization`

### 2. `mi_machine_fluid` — NEW measurement (written every 30s)
Tags: `node`, `type` (peripheral type e.g. `modern_industrialization:electric_furnace`),
      `name` (peripheral name), `fluid` (registry name e.g. `modern_industrialization:lv_steam`)
Fields: `amount` (mB), `capacity` (mB), `percent` (0-100)
- One point per non-empty fluid tank per machine per 30s cycle

### 3. `mi_machine_slot` — NEW measurement (written every 30s)
Tags: `node`, `type`, `name`, `item` (registry name)
Fields: `count` (integer), `slot` (integer slot index)
- One point per occupied inventory slot per machine per 30s cycle

### 4. `mi_machine_slot_summary` — NEW measurement (written every 30s)
Tags: `node`, `type`, `name`
Fields: `slots` (total slot count), `occupied` (occupied slot count)
- One summary point per MI machine per 30s cycle — useful for "is machine fed?" indicator

### 5. `energy_storage` — MI machines REMOVED
- Previously MI machines appeared here because CC GenericPeripheral wraps IEnergyStorage.
  This has been fixed: MI machines are now excluded.
- `energy_total` aggregate is now correct (only dedicated storage: Mekanism energy cubes,
  Powah batteries, AE2 energy cells, etc.)
- If any existing Flux queries filter by `mod=modern_industrialization` in `energy_storage`,
  remove or update them.

### 6. `machine_activity_diag` — effectively disabled
- Was written every 30s for all MI machines, now gated behind `machine_diag_enabled=false`
- Remove any dashboard panels or queries that read this measurement (they'll return empty)

## Files to read first

- `src/lib/queries.ts` — Flux query builders
- `src/pages/api/machines.ts` — machines API route
- `src/pages/api/energy.ts` — energy API route
- `src/pages/machines.astro` — machines page (complex grid UI, recently rewritten by user)
- `src/pages/index.astro` — overview page

## What to do

1. Read all files listed above.
2. Identify any queries that:
   - Read `machine_activity_diag` (remove or comment out)
   - Read `energy_storage` and may inadvertently rely on MI machines being present there
   - Show machine `active` status for MI machines (should use `inferred_active` instead)
3. Add Flux queries for the three new measurements where useful:
   - `machineSummaryMI()` or extend `machineSummary()` to include `inferred_active` for MI
   - `miMachineFluids(range)` — latest fluid levels per MI machine
   - `miMachineSlotSummary()` — latest slot occupancy per MI machine
4. Expose new data via API routes if the page needs it (add to `/api/machines` response)
5. Update `machines.astro` to show:
   - For MI machines: inferred_active indicator instead of (always-off) active dot
   - Optionally: fluid tank fill bars or slot occupancy badge on MI machine cards
6. Fix `index.astro` / `energy` API if MI machines were contributing to energy totals display

## Constraints

- Do not break existing Mekanism machine display (active/progress still works for those)
- Keep the MC pixel aesthetic (existing CSS classes: mc-slot, font-mc, text-mc-*, etc.)
- Use the existing Flux query pattern from queries.ts — no new dependencies
- Run `bun run build` at the end to verify no TypeScript errors
- Do NOT commit — leave changes staged for user review
