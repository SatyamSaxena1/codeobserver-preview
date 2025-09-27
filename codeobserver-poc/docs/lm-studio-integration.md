# LM Studio Integration Design

## Goals
- Decouple strategic analysis orchestration from concrete LM Studio usage.
- Support hot swapping between a deterministic fallback engine and the LM Studio backed engine.
- Preserve deterministic behaviour for tests while enabling realistic LM Studio invocations when configured.
- Reduce duplicate model reloads and provide clear observability into which engine produced an insight.

## Architecture Overview

```
ActivityMonitor ──▶ AnalysisOrchestrator ──▶ { LmStudioAnalysisEngine | HeuristicFallbackEngine }
                                     │
                                     └──▶ InsightStore
```

- **ActivityMonitor** emits batches of `ActivityEvent`s.
- **AnalysisOrchestrator** decides which engine to call based on configuration + runtime health.
- **LmStudioAnalysisEngine** uses `LmStudioClient` to execute Harmony prompts and parse responses.
- **HeuristicFallbackEngine** produces a deterministic summary for offline / failure scenarios.
- **InsightStore** persists the most recent insight and small history for UI commands.

## Component Responsibilities

### AnalysisOrchestrator
- Maintains configuration snapshot (objectives, cooldowns, LM Studio settings).
- Delegates to LM Studio or fallback engine depending on feature flag and runtime failures.
- Adds metadata to each insight (`source`, `errorMessage`, `promptId`).
- Handles retries: one LM Studio attempt, on error mark engine unhealthy until configuration changes.

### LmStudioAnalysisEngine
- Builds Harmony prompt payloads from `ActivityStats` and objectives.
- Calls `LmStudioClient.chat` with system prompt + timeout.
- Validates JSON payload, normalises confidence, truncates actions.
- Emits raw output in metadata for troubleshooting.

### HeuristicFallbackEngine
- Mirrors the existing deterministic logic (random message pool, action heuristics).
- Accepts `ActivityStats`, `objectives`, and `reason` to craft insight.

### Configuration Flow
1. `refreshConfiguration` hydrates settings into an immutable `AnalysisConfig` object.
2. Orchestrator compares snapshots; only rebuilds LM Studio engine when something changed.
3. When LM Studio enabled:
   - Creates new `LmStudioClient` with resolved path/model.
   - Preloads model optionally.
   - Marks LM Studio engine healthy.
4. When disabled:
   - Disposes existing LM Studio client (best-effort) and reverts to fallback only.

## Data Contracts

```ts
interface AnalysisConfig {
  objectives: string[];
  systemPrompt: string;
  lmStudio: {
    enabled: boolean;
    cliPath?: string;
    model?: string;
    timeoutMs: number;
    ttlSeconds?: number;
    preloadModel: boolean;
    host?: string;
    port?: number;
    offline: boolean;
  };
}

interface AnalysisResultMeta {
  source: 'lmstudio' | 'fallback';
  errorMessage?: string;
  promptId?: string;
  rawResponse?: string;
}
```

## Error Handling Strategy
- Any LM Studio invocation failure pushes the error into metadata and immediately falls back.
- Subsequent auto-triggered analyses remain on fallback until either:
  1. Configuration changes (indicating user intervention), or
  2. Manual command explicitly forces a retry (optional future enhancement).
- All failures logged to the VS Code output channel with timestamps.

## Testing Strategy
- Unit tests for `LmStudioAnalysisEngine` using stub client (success + invalid JSON + thrown errors).
- Unit tests for fallback engine to cover heuristic output.
- Integration-level test ensuring orchestrator toggles between LM Studio and fallback when configuration changes.
- Smoke tests (existing) verifying commands register and extension activates.

## Observability
- Output channel messages capture: configuration updates, engine enables/disables, preload status, failures.
- Insight metadata exposes `source`, `errorMessage`, and `rawResponse` for telemetry.
- Status bar text includes confidence percent to highlight LM Studio vs fallback parity.

## Future Enhancements
- Add telemetry on average LM Studio latency.
- Persist LM Studio health state across sessions.
- Provide command to inspect last raw Harmony response for debugging.
- Support multiple LM Studio models per workspace (multi-engine pool).
