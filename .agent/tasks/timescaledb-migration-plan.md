# Task: TimescaleDB Migration Plan

## Objective
Produce a complete, actionable migration plan to replace InfluxDB with TimescaleDB (PostgreSQL extension) for the Minecraft server telemetry pipeline. Be concrete — specific SQL, specific file changes, specific deployment steps. No hedging.

## Repositories
- **Dashboard**: `/Users/shelfwood/Projects/base.shelfwood.co` (Astro SSR)
- **Collector**: `/Users/shelfwood/Projects/mpm/mpm-packages/influx-collector` (CC:Tweaked Lua)

## Current Architecture
```
[CC:Tweaked Lua] → HTTP POST (InfluxDB line protocol) → [InfluxDB 2.7] → [Astro SSR dashboard]
```

## Target Architecture
```
[CC:Tweaked Lua] → HTTP POST (InfluxDB line protocol) → [Bun ingestion API] → [TimescaleDB] → [Astro SSR dashboard]
```

## Discovery Phase

### Understand current data model
```bash
# What measurements/fields exist?
ls /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/

# Read key collector files
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Machines.lua 2>/dev/null | head -100
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/Energy.lua 2>/dev/null | head -100
cat /Users/shelfwood/Projects/mpm/mpm-packages/influx-collector/AE.lua 2>/dev/null | head -100

# What Flux queries does the dashboard use?
ls /Users/shelfwood/Projects/base.shelfwood.co/src/lib/queries/
cat /Users/shelfwood/Projects/base.shelfwood.co/src/lib/queries/*.ts 2>/dev/null
```

### Understand the API routes
```bash
ls /Users/shelfwood/Projects/base.shelfwood.co/src/pages/api/
cat /Users/shelfwood/Projects/base.shelfwood.co/src/pages/api/machines.ts
cat /Users/shelfwood/Projects/base.shelfwood.co/src/pages/api/energy.ts 2>/dev/null
cat /Users/shelfwood/Projects/base.shelfwood.co/src/pages/api/ae-summary.ts 2>/dev/null
cat /Users/shelfwood/Projects/base.shelfwood.co/src/pages/api/crafting.ts 2>/dev/null
```

### Check existing Postgres setup
```bash
# Is Postgres already running on the droplet via Coolify?
# Check if there's a DATABASE_URL or POSTGRES connection string in env
cat /Users/shelfwood/Projects/base.shelfwood.co/.env 2>/dev/null || true
cat /Users/shelfwood/Projects/base.shelfwood.co/.env.local 2>/dev/null || true
```

### Check package.json for current DB dependencies
```bash
cat /Users/shelfwood/Projects/base.shelfwood.co/package.json
```

## Plan Output Requirements

Produce a complete migration plan covering ALL of the following. Be specific — write actual code, not pseudocode:

### 1. TimescaleDB Schema
- Complete `CREATE TABLE` / hypertable DDL for ALL measurements currently tracked
- Based on what you find in the Lua collector files, map each measurement to a proper schema
- Include: `time TIMESTAMPTZ`, tags as columns, fields as columns
- Include: `SELECT create_hypertable(...)` calls
- Include: retention policy via `add_retention_policy()`
- Include: compression policy
- Include: indexes for the query patterns used by the dashboard

### 2. Bun Ingestion API
- Full `server.ts` for a Bun HTTP server
- Accepts InfluxDB line protocol POST at `/api/v2/write?org=...&bucket=...`
- Parses line protocol (write a simple parser — no external libs needed)
- Batch inserts into TimescaleDB using postgres.js or pg
- Returns 204 on success (InfluxDB-compatible)
- Error handling: log and return 500, don't crash
- Target: deployable as a Docker container alongside TimescaleDB

### 3. Dockerfile for Ingestion API
- Simple Bun Dockerfile
- Environment vars: `DATABASE_URL`, `AUTH_TOKEN` (validates InfluxDB Authorization header)

### 4. Dashboard Query Migration
- For each Flux query file in `src/lib/queries/`, write the equivalent SQL
- Show exact `before` (Flux) and `after` (SQL with postgres.js) for each query
- The dashboard should use `postgres` (postgres.js) directly — no ORM
- Show the new `src/lib/db.ts` connection module

### 5. Infrastructure
- docker-compose.yml snippet for TimescaleDB + ingestion API
- Should work with Coolify (standard docker-compose)
- TimescaleDB image: `timescale/timescaledb:latest-pg16`
- Expose: TimescaleDB on internal network only, ingestion API on public port

### 6. Migration Steps (ordered, exact commands)
- Step 1: Deploy TimescaleDB + ingestion API alongside InfluxDB (dual-write period)
- Step 2: Update Lua collector to point to new ingestion API URL (or dual-write)
- Step 3: Backfill from InfluxDB (flux query → insert to TimescaleDB) — provide the script
- Step 4: Switch dashboard queries to TimescaleDB
- Step 5: Remove InfluxDB

### 7. Cost estimate
- What DigitalOcean droplet size for TimescaleDB? ($6/mo Basic is enough — it's Postgres)
- Can TimescaleDB share the existing droplet? (Yes if current droplet has Postgres)

## Output
Output the ENTIRE plan directly in chat as structured markdown. Include all code blocks inline.
This is a planning document — do NOT make any file changes to the repositories.
Do NOT write output to any .md files.
