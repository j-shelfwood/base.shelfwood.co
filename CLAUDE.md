# base.shelfwood.co

Astro SSR dashboard for a Minecraft server telemetry stack.

## Backend

- **Database**: PostgreSQL + TimescaleDB extension (NOT InfluxDB)
- **Ingestion endpoint**: `influx.shelfwood.co` — accepts InfluxDB line protocol but writes to TimescaleDB. URL kept unchanged so collectors didn't need updating.

## Related projects

- **mc-ingest**: `~/Projects/mc-ingest`
  - Bun HTTP server that accepts InfluxDB line protocol at `influx.shelfwood.co/api/v2/write` and inserts into TimescaleDB.
  - Not a git repo — source lives on the server at `/data/mc-ingest/`. Local copy is for development.
  - Traefik routing configured via `/traefik/dynamic/mc-ingest.yml` on the server (manual, not Coolify-managed).
  - Container must be on the `coolify` Docker network for Traefik to reach it (`docker network connect coolify ingest-api-mc` after any compose restart).

- **Collector**: `~/Projects/mpm/mpm-packages/influx-collector`
  - CC:Tweaked Lua scripts running on in-game computers that collect machine, energy, AE2, and crafting telemetry and POST to `influx.shelfwood.co`.
  - Write frequency is the primary lever for database load — see collector scripts to throttle intervals.
