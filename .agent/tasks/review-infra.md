# Task: Review TimescaleDB Migration Plan — Infrastructure (infrastructure.shelfwood.co)

## Objective
Review the TimescaleDB migration plan against the actual infrastructure configuration. Understand what's currently deployed, how InfluxDB is configured, and what changes are needed to deploy TimescaleDB + the Bun ingestion API alongside it.

## Repo
`/Users/shelfwood/Projects/infrastructure.shelfwood.co/`

## Your Task

### 1. Discover the infrastructure layout
```bash
tree /Users/shelfwood/Projects/infrastructure.shelfwood.co/ --gitignore -L 3
cat /Users/shelfwood/Projects/infrastructure.shelfwood.co/services/influx.shelfwood.co/docker-compose.yml 2>/dev/null || true
ls /Users/shelfwood/Projects/infrastructure.shelfwood.co/services/influx.shelfwood.co/
cat /Users/shelfwood/Projects/infrastructure.shelfwood.co/services/base.shelfwood.co/docker-compose.yml 2>/dev/null || true
ls /Users/shelfwood/Projects/infrastructure.shelfwood.co/services/base.shelfwood.co/
cat /Users/shelfwood/Projects/infrastructure.shelfwood.co/CLAUDE.md 2>/dev/null || true
cat /Users/shelfwood/Projects/infrastructure.shelfwood.co/README.md 2>/dev/null || true
```

### 2. Understand the current InfluxDB deployment
- How is InfluxDB deployed? (docker-compose, Coolify resource, etc.)
- What volumes are mounted?
- What env vars are set?
- What network is it on?
- Is there a Traefik config routing influx.shelfwood.co to it?

### 3. Understand the current Postgres deployment
- Is there already a Postgres or TimescaleDB instance running on this droplet?
- If so, what's the connection string pattern? Can TimescaleDB extension be added to it?
- If not, where would a new TimescaleDB container live?

### 4. Design the new service config
Based on what you find, produce:
- A `docker-compose.yml` snippet for the TimescaleDB service (or confirm it can be added to existing Postgres)
- A `docker-compose.yml` snippet for the Bun ingestion API service
- Traefik labels for exposing the ingestion API at a public URL (e.g. `ingest.shelfwood.co` or a path on `influx.shelfwood.co`)
- Environment variable list for the ingestion API container

### 5. Migration deployment sequence
Exact steps to deploy TimescaleDB + ingestion API without disrupting existing services:
1. What docker network to use?
2. What volume name for TimescaleDB data?
3. How to deploy via Coolify or docker compose?
4. How to verify TimescaleDB is accepting connections before switching traffic?

### 6. InfluxDB decommission checklist
What needs to be removed/changed in the infra repo when InfluxDB is eventually dropped:
- Which service configs to delete
- Which env vars to remove
- Which Traefik routes to remove
- Which volumes to backup and delete

## Output
Output a complete review directly in chat as structured markdown. Include:
- Current InfluxDB deployment summary
- Current Postgres situation (shared or none)
- Proposed docker-compose snippets (TimescaleDB + ingestion API)
- Deployment sequence (exact commands)
- Decommission checklist

Do NOT write to any files. Do NOT commit anything.
