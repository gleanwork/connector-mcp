# Contributing to @gleanwork/connector-mcp

Thank you for contributing. This document covers environment setup, the three test tiers, the source architecture, and the pull request process.

## Prerequisites

| Requirement                          | Version | Notes                                                                                                                    |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node.js                              | >= 18   | Use the version pinned in `.mise.toml` / `.nvmrc` if present                                                             |
| [uv](https://docs.astral.sh/uv/)     | latest  | Required for Copier scaffolding and Python worker execution                                                              |
| Python                               | >= 3.10 | Used by uv for connector execution and integration tests                                                                 |
| SSH access to `github.com/gleanwork` | —       | Required for Copier to clone the connector template from `git+ssh://git@github.com/gleanwork/copier-glean-connector.git` |

Install uv by following the [official instructions](https://docs.astral.sh/uv/getting-started/installation/). Verify with:

```sh
uv --version
```

## Setup

```sh
npm install
npm run build
```

`npm run build` compiles TypeScript to `dist/` and marks `bin/connector-mcp.js` executable. The `prepare` lifecycle hook runs this automatically after `npm install` in most environments.

## Running Tests

There are three test tiers with different scope, speed, and external dependencies.

### Tier 1 — Unit Tests (`npm test`)

```sh
npm test
```

- **Framework**: Vitest
- **Coverage**: All tool handlers (`src/tools/`), the code generator, schema-store, and file analyzer
- **External dependencies**: None. The Copier runner and worker pool are mocked at the module boundary; no Python, no filesystem side effects beyond temporary directories
- **Speed**: Fast (< 5 s)
- **When to run**: On every change. CI blocks on this tier

The unit tests live in `tests/tools/` (per-tool) and `tests/integration/full-workflow.test.ts` (full happy-path through all handlers without spawning real Python).

### Tier 2 — MCP E2E Tests (`npm run test:mcp`)

```sh
npm run test:mcp
```

- **Framework**: [Playwright](https://playwright.dev/) + [@gleanwork/mcp-server-tester](https://github.com/gleanwork/mcp-server-tester)
- **Coverage**: The real compiled server binary (`bin/connector-mcp.js`) started as a subprocess; tool invocations over the MCP stdio transport; conformance checks (tool listing, schema validation)
- **External dependencies**: Node.js only. Each test gets an isolated project directory under `os.tmpdir()`; no Python worker is spawned
- **Speed**: Moderate (15–30 s including `npm run build`)
- **When to run**: Before pushing. CI runs this tier in a dedicated `mcp-e2e` job

Tests live in `tests/mcp/connector-mcp.spec.ts`. Playwright configuration is in `playwright.config.ts`.

To open the interactive Playwright UI:

```sh
npm run test:mcp:ui
```

### Tier 3 — Integration Tests (`npm run test:mcp:integration`)

```sh
npm run test:mcp:integration
```

- **Framework**: Vitest (tagged `@slow`)
- **Coverage**: Real Copier scaffolding (clones the `copier-glean-connector` template over SSH), real Python worker execution (`uv run python -m glean.indexing.worker`), end-to-end schema inference through connector execution
- **External dependencies**: uv, Python >= 3.10, SSH access to `github.com/gleanwork`, a network connection for template download
- **Speed**: Slow (60–120 s depending on network)
- **When to run**: Manually before a release or when changing Copier/worker integration code. Not run in standard CI

Tests live in `tests/integration/` and are marked with a `@slow` tag in their description so they can be filtered.

> If you do not have SSH access to `github.com/gleanwork`, set `GLEAN_CONNECTOR_TEMPLATE_PATH` to a local checkout of the template before running integration tests.

## Other Scripts

| Script                 | Purpose                       |
| ---------------------- | ----------------------------- |
| `npm run build`        | Compile TypeScript            |
| `npm run typecheck`    | Type-check without emitting   |
| `npm run lint`         | ESLint on `src/` and `tests/` |
| `npm run lint:fix`     | ESLint with auto-fix          |
| `npm run format`       | Prettier formatting           |
| `npm run format:check` | Prettier check (used in CI)   |
| `npm run dev`          | Watch mode via tsx            |

## Architecture Overview

```
src/
├── index.ts                    Entry point: checks uv dependency, starts MCP server over stdio
├── server.ts                   Registers all 14 tools and the connector://workflow resource
├── session.ts                  In-process active project path (set by create_connector, read by all tools)
│
├── tools/
│   ├── create-connector.ts     Invokes copier-runner to scaffold project, updates session path
│   ├── schema.ts               infer_schema, get_schema, update_schema, analyze_field
│   ├── mapping.ts              get_mappings, confirm_mappings, validate_mappings
│   ├── config.ts               get_config, set_config
│   ├── build.ts                build_connector (delegates to code-generator)
│   └── execution.ts            run_connector, inspect_execution, manage_recording
│
├── core/
│   ├── copier-runner.ts        Thin wrapper: uv run copier copy <template> <project>
│   ├── worker-pool.ts          Subprocess manager for Python workers (JSON-RPC over stdio)
│   ├── code-generator.ts       Generates connector.py, models.py, mock_data.json from schema+mappings
│   ├── schema-manager.ts       Infers SchemaDefinition from JSON/CSV/OpenAPI data samples
│   ├── recording-manager.ts    Records and replays API responses in .glean/recordings/
│   ├── validation-rules-manager.ts  Loads and evaluates Glean entity model validation rules
│   └── fs-utils.ts             Atomic file write helper
│
├── lib/
│   ├── schema-store.ts         Canonical flat StoredSchema format: disk I/O + legacy conversion
│   ├── file-analyzer.ts        CSV, JSON, NDJSON parsing and per-field statistics
│   ├── glean-entity-model.ts   Glean entity model definitions (required fields, types)
│   ├── execution-store.ts      Persists execution state to .glean/executions/
│   └── logger.ts               Structured logger (pino-style, writes to stderr)
│
├── resources/
│   └── workflow.ts             WORKFLOW_GUIDE constant served as connector://workflow
│
├── templates/
│   └── CLAUDE.md.template      Injected into scaffolded projects for Claude Code users
│
└── types/
    └── index.ts                Shared TypeScript types (SchemaDefinition, FieldType, etc.)
```

### Key data flows

1. **Scaffolding**: `create_connector` → `copier-runner.ts` → `uv run copier` → sets `session.ts` active path
2. **Schema**: `infer_schema` → `file-analyzer.ts` or `schema-manager.ts` → `schema-store.ts` (writes `.glean/schema.json`)
3. **Build**: `build_connector` → reads `schema-store.ts` + mappings + config → `code-generator.ts` → writes `connector.py`, `models.py`
4. **Execution**: `run_connector` → `worker-pool.ts` spawns `uv run python -m glean.indexing.worker` → `execution-store.ts` persists state → `inspect_execution` polls

### Schema format

The canonical on-disk format (`.glean/schema.json`) is the flat `StoredSchema`:

```json
{
  "fields": [
    { "name": "id", "type": "string", "required": true },
    { "name": "title", "type": "string", "required": false }
  ],
  "sampleData": []
}
```

The older `SchemaDefinition` format (with an `entities` array) is still accepted and is silently converted on read by `schema-store.ts`.

## Submitting Changes

1. Branch off `main`:
   ```sh
   git checkout -b your-feature-branch
   ```
2. Make changes. Keep `src/` and `tests/` changes in separate commits where possible.
3. Ensure all checks pass locally:
   ```sh
   npm run format:check
   npm run lint
   npm run typecheck
   npm test
   npm run test:mcp
   ```
4. Open a pull request against `main`. The CI pipeline runs formatting, linting, type checking, unit tests (Node 20/22/24 matrix), and MCP E2E tests automatically.
5. A maintainer will review and merge. Squash merges are preferred for small changes; merge commits for larger features.

## Releasing

Releases are managed with [release-it](https://github.com/release-it/release-it):

```sh
npm run release
```

This bumps the version in `package.json`, creates a git tag (`v{version}`), pushes a GitHub release, and publishes to npm. You must have `GITHUB_AUTH` set to a GitHub token with `repo` scope and be authenticated with npm.
