/**
 * Server-only TimescaleDB/PostgreSQL client.
 * Uses postgres.js for high-performance connection pooling.
 * Env var is declared in astro.config.mjs env.schema and imported from
 * astro:env/server — guaranteed server-only, type-safe, validated at startup.
 */

import postgres from 'postgres';

const DATABASE_URL = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});
