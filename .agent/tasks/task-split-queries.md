# Task: Split queries.ts by Domain

## Objective

`src/lib/queries.ts` is 909 lines covering 5 unrelated domains. Split it into domain files while keeping all exports working via a barrel re-export.

## Current structure

```bash
grep -n "^export async function\|^export interface\|^// ──" src/lib/queries.ts
```

The domains and their approximate line ranges:
- **Energy** (~lines 28–143): `EnergySummary`, `EnergyFlow`, `TimePoint`, `energySummary`, `energyFlow`, `energyHistory`, `energyFlowHistory`, `energyStoredHistory`, `energyNetHistory`, `energyDevices`, `energyDeviceHistory`, `EnergyDevice`
- **AE** (~lines 145–580): `AESummary`, `AEItem`, `AEFluid`, `AEChemical`, `ItemVelocity`, `aeSummary`, `aeSummaryHistory`, `aeItems`, `aeItemHistory`, `aeItemVelocity`, `aeCPUs`, `aeFluids`, `aeFluidHistory`, `aeFluidVelocity`, `aeChemicals`, `aeChemicalHistory`, `aeChemicalVelocity`
- **Crafting** (~lines 580–642): `CraftingJob`, `craftingJobs`, `craftingTaskCount`, `craftingTaskHistory`, `craftingCpuHistory`
- **Machines** (~lines 305–580 + 760–874): `MachineSummary`, `MachineType`, `MekanismMachine`, `MIMachine`, `MIMachineGroup`, `MIMachineFluid`, `MISlotItem`, `machineSummary`, `machineTypes`, `mekanismMachines`, `miMachines`, `miMachineGroups`, `miMachineFluids`, `miMachineSlotItems`, `machineActivityHistory`, `machineActivePercentHistory`, `machineTypeHistory`, `modActivityHistory`

Note: `TimePoint` is used across all domains — keep it in a shared file or in energy.ts and import from there.

## Implementation

### Step 1 — Read the file boundaries precisely
```bash
grep -n "^export\|^// ──" src/lib/queries.ts
```

### Step 2 — Create domain files

Create these files, each containing ONLY the relevant interfaces and functions:

- `src/lib/queries/energy.ts`
- `src/lib/queries/ae.ts`
- `src/lib/queries/crafting.ts`
- `src/lib/queries/machines.ts`

Each file starts with:
```typescript
import { queryFlux, INFLUX_BUCKET } from '../influx';
```

`TimePoint` and `rangeToWindow` are used by multiple domains. Put them in `src/lib/queries/shared.ts`:
```typescript
export interface TimePoint { time: string; value: number; }
export function rangeToWindow(range: string): string { ... }
```

Each domain file imports from shared:
```typescript
import { queryFlux, INFLUX_BUCKET } from '../influx';
import { type TimePoint, rangeToWindow } from './shared';
```

### Step 3 — Create barrel re-export

Replace `src/lib/queries.ts` content with:
```typescript
// Barrel re-export — import from here as before
export * from './queries/shared';
export * from './queries/energy';
export * from './queries/ae';
export * from './queries/crafting';
export * from './queries/machines';
```

### Step 4 — Verify nothing else needs updating

```bash
grep -rn "from '@/lib/queries'" src/
grep -rn "from '../lib/queries'" src/
grep -rn "from './queries'" src/
```

All imports use `@/lib/queries` which resolves to the barrel — no other files need changing.

## IMPORTANT
- Do NOT change any function signatures or export names
- The barrel `src/lib/queries.ts` stays at the same path — all existing imports continue to work
- `rangeToWindow` is currently not exported (lowercase, no `export`). Keep it unexported in `shared.ts` — only `TimePoint` needs to be exported from shared
- Actually check: if `rangeToWindow` is used across domain files it needs to be exported from shared and imported in each domain file

## Verification
```bash
bun run build
```
Zero errors required.

## Output
Report: files created, line counts per file, build result.
