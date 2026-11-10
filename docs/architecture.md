# RateFence architecture

See the Phase 1 architecture decisions:

- Monorepo packages: `rate-fence` + `@rate-fence/express`
- Allowlist bypasses IP deny only
- Evaluation order documented in the root README
- Default store is process-local memory only

Core modules live under `packages/core/src/`:

- `engine/` — decision orchestration
- `rate-limit/` — fixed / sliding / token-bucket
- `policies/` — matching and IP access
- `threat/` — signal-driven detection
- `protection/` — concurrency and size
- `storage/` — `StateStore` + `MemoryStateStore`
- `context/` / `ip/` / `events/`
