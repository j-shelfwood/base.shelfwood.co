# base.shelfwood.co

Astro SSR dashboard for a Minecraft server telemetry stack.

## Related projects

- **InfluxDB collector**: `~/Projects/mpm/mpm-packages/influx-collector`
  - CC:Tweaked Lua scripts running on in-game computers that collect machine, energy, AE2, and crafting telemetry and POST it to InfluxDB.
  - Write frequency is the primary lever for InfluxDB load — see collector scripts to throttle intervals.
