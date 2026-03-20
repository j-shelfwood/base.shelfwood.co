# Task: Set InfluxDB Retention Policy on mc bucket

## Objective
Set a 30-day retention policy on the InfluxDB `mc` bucket to stop unbounded data growth.
InfluxDB is running at https://influx.shelfwood.co (also accessible via Docker on the same droplet as base.shelfwood.co).

## Context
- InfluxDB 2.7 in Docker on DigitalOcean droplet
- Bucket: "mc", org: "shelfwood"
- Currently NO retention policy — data grows forever
- This is causing WAL bloat and memory pressure

## Steps

### 1. Check current bucket config
```bash
# Get the InfluxDB token from environment/Coolify or docker inspect
docker exec $(docker ps --filter "name=influx" -q) influx bucket list --org shelfwood
```

If docker isn't available locally, check if there's a .env or config file:
```bash
find /Users/shelfwood/Projects/base.shelfwood.co -name "*.env" -o -name ".env*" | head -5
cat /Users/shelfwood/Projects/base.shelfwood.co/.env 2>/dev/null || true
```

### 2. Identify the InfluxDB token
Look for INFLUX_TOKEN or similar in:
- `/Users/shelfwood/Projects/base.shelfwood.co/.env`
- `/Users/shelfwood/Projects/base.shelfwood.co/.env.local`
- Any docker-compose or Coolify config files

### 3. Set 30d retention via InfluxDB HTTP API
Use the token found above:
```bash
# Replace TOKEN with actual token
curl -s -X PATCH "https://influx.shelfwood.co/api/v2/buckets" \
  -H "Authorization: Token TOKEN" \
  -H "Content-Type: application/json" | jq '.buckets[] | select(.name=="mc") | {id, name, retentionRules}'
```

Then update:
```bash
# First get bucket ID
BUCKET_ID=$(curl -s "https://influx.shelfwood.co/api/v2/buckets?org=shelfwood&name=mc" \
  -H "Authorization: Token TOKEN" | jq -r '.buckets[0].id')

# Set 30d retention (2592000 seconds)
curl -s -X PATCH "https://influx.shelfwood.co/api/v2/buckets/$BUCKET_ID" \
  -H "Authorization: Token TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"retentionRules":[{"type":"expire","everySeconds":2592000}]}' | jq .
```

### 4. Verify
```bash
curl -s "https://influx.shelfwood.co/api/v2/buckets?org=shelfwood&name=mc" \
  -H "Authorization: Token TOKEN" | jq '.buckets[0].retentionRules'
```

## Output
Output directly in chat:
- Whether retention was set successfully
- The bucket ID and confirmed retention value
- Current bucket size if discoverable
- Any errors encountered with suggested fixes

Do NOT write to any .md files.
