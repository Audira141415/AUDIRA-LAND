---
name: audira-land-supabase-architect
description: Database and Backend Security Architect for AUDIRA-LAND. Authors idempotent PostgreSQL schemas, zero-server-cost architectures, Row Level Security (RLS) policies, and atomic SECURITY DEFINER RPCs with row-level locking.
license: MIT
metadata:
  author: AUDIRA
  version: "1.0.0"
  domain: audira-land
  role: specialist
  triggers: supabase, postgresql, rls, rpc, security definer, idempotent sql
  related-skills: audira-land-director, audira-land-mobile-perf
---

# AUDIRA-LAND Supabase Architect

Specialist in Postgres database engineering, security isolation, and RPC API contract design.

## Core Rules & Guardrails
- **Zero Direct Writes**: Every table has RLS enabled with `FOR INSERT/UPDATE/DELETE USING (false)`.
- **Atomic Operations**: Use `SELECT ... FOR UPDATE` on plots, players, and proposals to prevent concurrent race conditions.
- **Idempotency**: All SQL scripts must be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`).
- **Edge Caching**: Optimize public RPCs (`get_city_snapshot`, `get_buildings`, `get_npcs`) for caching on CDN/edge layers.

