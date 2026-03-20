# Task: Design ideal telemetry pipeline for a Minecraft server dashboard

## Objective
You are an infrastructure/architecture expert. Produce a detailed, opinionated plan for redesigning a Minecraft server telemetry pipeline from scratch. Be concrete — name specific tools, configs, and code patterns. Don't hedge.

## Current Stack Context

**Collector (Lua, CC:Tweaked in-game computers)**
- Located: ~/Projects/mpm/mpm-packages/influx-collector
- CC:Tweaked computers run Lua scripts that poll in-game peripherals (Mekanism machines, Modern Industrialization machines, AE2 storage network, energy storage)
- Polls machine activity, energy levels, crafting jobs, item counts
- Writes via HTTP POST to InfluxDB line protocol
- Currently: 15s poll intervals, ~3 nodes (cc-49, cc-57, cc-58), ~26+ machines tracked
- Write rate after tuning: ~400 line protocol records/min
- Buffer: in-memory Lua table, flushed every 10s, max 5000 lines before drop

**Database**
- InfluxDB 2.7 in Docker on a shared DigitalOcean droplet
- Same droplet runs: Coolify, Mattermost, MySQL, Postgres, Traefik, BugSink
- Memory: 3GB limit (raised today), was crashing repeatedly at 2GB
- Issues: WAL snapshots OOM-killing process, high CPU during compaction, crash loops
- No retention policy set — data grows forever
- Bucket: "mc", org: "shelfwood"

**Dashboard (Astro SSR + client-side JS)**
- Located: ~/Projects/base.shelfwood.co
- Astro with Node adapter, deployed via Coolify on same droplet
- SSR fires ~8 summary queries on page load
- Client-side lazy loads history charts via IntersectionObserver
- Range queries: 1h/6h/24h/7d/30d
- Flux query language
- API routes: /api/machines, /api/energy, /api/ae-summary, /api/crafting, etc.

**Key pain points**
1. InfluxDB crashing repeatedly under write + query load on shared memory
2. No backpressure — collector silently drops data when influx is down
3. Write rate grows linearly with machine count — already ~400/min at 26 machines
4. Compaction/WAL flushing spikes memory unpredictably
5. withHistoryFallback fires double queries when collectors offline
6. No retention policy — unbounded data growth
7. All infrastructure on one shared droplet with many other services

## Your Task

Design the ideal pipeline for this use case. Cover:

1. **Collector layer** — Should the Lua code change? Batching strategy, write format, error handling, backpressure
2. **Transport/ingestion** — Direct to DB? A queue/buffer in between? What protocol?
3. **Database choice** — Is InfluxDB still right? Alternatives? Why?
4. **Infrastructure** — Where does each component live? Separate droplet? What size?
5. **Dashboard queries** — How should the Astro app query data? Connection pooling, caching, timeouts?
6. **Retention** — What data do we actually need to keep and for how long?
7. **Operational concerns** — Monitoring, alerting, recovery from collector downtime

## Constraints
- This is a hobby project. Cost matters. Keep it cheap.
- The Lua collector CANNOT use external libraries — only CC:Tweaked HTTP API
- The dashboard is Astro SSR — changing frameworks is an option but costly
- In-game computers can't run Docker or anything complex
- DigitalOcean droplets are the hosting platform

## Output
Output your complete plan directly in chat as structured markdown. Be specific and opinionated. No hedging. Include:
- A recommended architecture diagram (ASCII)
- Specific tool versions/choices with reasoning
- Any config snippets or code patterns that would change
- Cost estimate
- Migration path from current state
