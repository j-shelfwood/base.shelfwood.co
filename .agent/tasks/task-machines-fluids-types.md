# Task: Machines Page — MI Fluid Tanks Panel + Unified Machine Type Chart

## Objective
Two additions to machines.astro:
1. MI Machine Fluid Tanks panel — render `miMachineFluids()` data (currently fetched but NEVER shown anywhere)
2. Unified cross-mod machine type chart using `machineTypes()` (fetched but discarded — only mekByType is used)

## Real data context

### mi_machine_fluid measurement (actual data):
- electric_cutting_machine_0..9: lubricant (modern_industrialization:lubricant), amount=16000, capacity=0 (note: capacity=0 means full/no-cap)
- electric_mixer_2, _8: minecraft:water, amount=875/625, capacity=0

Tags: name (machine instance), type (full mod:type), fluid (mod:fluid_name), node
Fields: amount (int mB), capacity (int mB), percent (float 0-100)

### machine_type measurement (actual data):
MI types: extended_industrialization:electric_bending_machine (8), modern_industrialization:assembler (8),
  electric_compressor (12), electric_cutting_machine (10), electric_mixer (12), electric_wiremill (10), polarizer (2)
Mekanism types: basicCompressingFactory (1), chemicalOxidizer (2), eliteCrushingFactory (2),
  eliteEnrichingFactory (2), eliteInfusingFactory (2), eliteSawingFactory (2), ultimateSmeltingFactory (2)
Tags include `mod` (modern_industrialization / mekanism) and `category`

## Step 1 — Verify miMachineFluids is already in queries.ts
It should be around line 508. Just import and use it — don't rewrite it.

## Step 2 — Update src/pages/api/machines.ts
Add `miMachineFluids` to imports and fetch:
```typescript
import { ..., miMachineFluids } from '@/lib/queries';

// Add to Promise.all:
miMachineFluids(),

// Add to response:
return Response.json({ summary, types, mekanism, mi, activityHistory, slotItems, fluids });
```

## Step 3 — Update src/pages/machines.astro

### 3a — SSR data fetch
```typescript
import { ..., miMachineFluids } from '@/lib/queries';

// Add to Promise.allSettled:
miMachineFluids(),

// Destructure:
const miFluids = miFluidsRes.status === 'fulfilled' ? miFluidsRes.value : [];
```

### 3b — Add MI FLUID TANKS panel

After the existing MI machines section, add a new panel:

```astro
<Panel title="MI FLUID TANKS" raised noPadding class="mb-6">
  {miFluids.length === 0 ? (
    <p class="font-mc text-base text-mc-muted p-4">No fluid tank data</p>
  ) : (
    <div class="divide-y divide-mc-cobble/20">
      {/* Group by fluid type */}
      {[...new Set(miFluids.map(f => f.fluid))].map(fluid => {
        const fluidLabel = fluid.replace(/^.*:/, '').replace(/_/g, ' ').toUpperCase();
        const tanks = miFluids.filter(f => f.fluid === fluid);
        const totalAmount = tanks.reduce((s, t) => s + t.amount, 0);
        return (
          <div class="px-4 py-3">
            <div class="flex items-center justify-between mb-2">
              <span class="font-mc text-sm text-mc-diamond">{fluidLabel}</span>
              <span class="font-mc text-xs text-mc-muted">{tanks.length} tank{tanks.length !== 1 ? 's' : ''} · {(totalAmount/1000).toFixed(1)}B total</span>
            </div>
            <div class="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {tanks.slice(0, 8).map(t => {
                const machLabel = t.name.replace(/^.*:/, '').replace(/_\d+$/, '').replace(/_/g, ' ');
                const pct = t.capacity > 0 ? Math.min(100, (t.amount / t.capacity) * 100) : (t.amount > 0 ? 100 : 0);
                return (
                  <div class="flex flex-col gap-1">
                    <span class="font-mc text-xs text-mc-muted truncate">{machLabel}</span>
                    <div class="mc-progress-track">
                      <div class="mc-progress-fill bg-mc-diamond" style={`width:${pct}%`} />
                    </div>
                    <span class="font-mc text-xs text-mc-muted">{t.amount >= 1000 ? (t.amount/1000).toFixed(1)+'B' : t.amount+'mB'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  )}
</Panel>
```

### 3c — Add MACHINE TYPE OVERVIEW panel using machineTypes()

`machineTypes()` is already fetched in SSR but stored as `const machTypes = ...` (check what variable name it uses — look for machTypesRes or similar).

If `machTypes` is available, add a unified cross-mod type comparison panel. Put it BEFORE the MEKANISM MACHINES panel:

```astro
<Panel title="TYPE OVERVIEW" raised class="mb-6">
  <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Group by mod */}
    {(['mekanism', 'modern_industrialization'] as const).map(mod => {
      const modTypes = machTypes.filter(t => t.mod === mod);
      if (modTypes.length === 0) return null;
      const modLabel = mod === 'mekanism' ? 'MEKANISM' : 'MODERN INDUSTRIALIZATION';
      const modColour = mod === 'mekanism' ? 'mc-amethyst' : 'mc-diamond';
      return (
        <div>
          <span class={`font-mc text-sm text-${modColour} mb-3 block`}>{modLabel}</span>
          <div class="space-y-2">
            {modTypes.map(t => {
              const label = t.type.replace(/^.*:/, '').replace(/_/g, ' ').replace(/Factory$/, 'Fac');
              const pct = t.total_count > 0 ? (t.active_count / t.total_count) * 100 : 0;
              return (
                <div class="flex items-center gap-3">
                  <span class="font-mc text-xs text-mc-muted w-36 truncate shrink-0">{label}</span>
                  <div class="flex-1 mc-progress-track">
                    <div class={`mc-progress-fill bg-${modColour}`} style={`width:${pct}%`} />
                  </div>
                  <span class="font-mc text-xs text-mc-muted w-12 text-right shrink-0">{t.active_count}/{t.total_count}</span>
                </div>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
</Panel>
```

IMPORTANT: Check what variable name `machineTypes()` result is stored under in the SSR section. Look for `machTypesRes` or similar. The variable holding the resolved value might be `machTypes` or need to be added. Check the existing allSettled destructuring.

## Verification
```bash
bun run build
```
Must complete "Complete!" with zero errors.

## Output
Report in chat:
- Files modified
- Variable name used for machineTypes result
- Build result
- Note if miFluids data had any unexpected structure
