# CodeObserver POC

A proof-of-concept Visual Studio Code extension that keeps your GitHub Copilot workflow intact while a local "strategic observer" keeps watch. The observer aggregates workspace activity, synthesizes lightweight insights, and surfaces them through ambient UI affordances.

## Key Capabilities

- **Ambient monitoring** of document opens, edits, saves, selections, and Copilot command usage (when the API is available).
- **Strategic insight generation** via a modular analysis orchestrator that prefers any LM Studio model you configure while preserving an automatic deterministic fallback when offline.
- **Insight surfacing** with a status bar indicator, quick history browsing, and on-demand notifications.
- **Configuration hooks** for custom objectives and analysis cool-down windows.
- **Foundational tests** to ensure extension activation and command registration.

## Getting Started

1. Install dependencies:
   ```powershell
   npm install
   ```
2. Compile the extension:
   ```powershell
   npm run compile
   ```
3. Launch the extension in the VS Code Extension Development Host:
   ```powershell
   npm run watch
   ```
   Then press <kbd>F5</kbd> in VS Code to start a new Extension Development Host session.
4. Trigger insights:
   - Run `CodeObserver: Activate (Start Monitoring)` from the command palette to initialize the observer for the current window.
   - After activation, save files or execute Copilot commands to generate automatic analyses (subject to cool-down).
   - Run `CodeObserver: Run Strategic Analysis` from the command palette for a manual insight.
   - Click the status bar item or run `CodeObserver: Show Latest Insight` to view results.
   - Browse previous results with `CodeObserver: Show Insight History`.

### Manual Preview Installation

1. Download the latest `codeobserver-poc-<version>.vsix` package from the GitHub release page (each release automatically includes the VSIX asset).
2. In VS Code, open the command palette and run `Extensions: Install from VSIX...`.
3. Select the downloaded file and reload the window when prompted.
4. Verify the status bar indicator appears and open the **CodeObserver** output channel for diagnostics.

## Configuration

`File > Preferences > Settings > Extensions > CodeObserver` exposes the configuration surface:

- **Objectives**: High-level goals that guide synthesized insights.
- **Analysis Cooldown**: Minimum seconds between automatic analyses triggered by new activity.
- **LM Studio**: Enable the local CLI, point to the executable, select a model (via `CodeObserver: Select LM Studio Model`), and optionally override timeout, warm TTL, system prompt, offline mode, and host/port settings.

### Automated Release Workflow

- Pushing commits to `main` triggers the CI workflow in `.github/workflows/ci.yml`, which now runs linting and tests across a Node.js/OS matrix, performs a Linux smoke package, and produces a cosign-signed VSIX artifact for download.
- Creating or publishing a GitHub release (or manually dispatching the "Release" workflow) runs `.github/workflows/release.yml`. The job rebuilds the VSIX from the tagged source, signs it using GitHub OIDC with cosign, verifies the signature, and uploads the VSIX + signature + certificate to the release.

To cut a new preview/Maketplace candidate:

1. Bump the version in `package.json` and update `CHANGELOG.md`.
2. Commit the changes and create an annotated tag that matches the version (`git tag -a vX.Y.Z -m "CodeObserver Preview X.Y.Z"`).
3. Push the branch and tag (`git push && git push origin vX.Y.Z`).
4. Draft or publish a GitHub release for that tag—once the release is published the workflow uploads the VSIX artifact automatically.
5. Download the attached VSIX for Marketplace submission or manual distribution.

### LM Studio Integration

1. Install LM Studio and note the absolute path to `lms.exe` (on Windows) or the CLI binary for your platform.
2. Download the models you plan to use within LM Studio.
3. In VS Code, set **CodeObserver › LM Studio › CLI Path**, then run `CodeObserver: Select LM Studio Model` to pick from the downloaded list (or enter a custom identifier). Enable **CodeObserver › LM Studio › Enabled** when you're ready.
4. Trigger an analysis (save a file or run `CodeObserver: Run Strategic Analysis`). The status bar and output channel will confirm whether the real model or the built-in fallback produced the insight.

### Preview Limitations

- LM Studio must be running with the configured model preloaded; otherwise the extension falls back to the deterministic analyzer.
- GitHub Copilot telemetry hooks are stubbed when the external API is unavailable, so some Copilot-specific insights are placeholders.
- Insights currently refresh on manual commands or activity-triggered cooldowns—long-running sessions may require manual refreshes.
- Verbose logging is recommended during the preview to capture LM Studio health details in the output channel.

## Project Structure

```
codeobserver-poc/
├── src/
│   ├── activityMonitor.ts      # Event aggregators for file, selection, and Copilot telemetry
│   ├── analysisEngine.ts       # Orchestrator that routes to LM Studio or heuristic analyzers
│   ├── analysisTypes.ts        # Shared context/stat structures for analyzers
│   ├── activityStats.ts        # Helpers for summarising recent activity into prompt-friendly stats
│   ├── analyzers/
│   │   ├── heuristicAnalyzer.ts # Deterministic fallback insight generator
│   │   └── lmStudioAnalyzer.ts  # Harmony prompt + LM Studio response interpreter
│   ├── insightStore.ts         # In-memory storage for latest insights and history
│   ├── extension.ts            # Activation entry point wiring everything together
│   └── test/                   # Mocha-based smoke tests
├── dist/                       # TypeScript compilation output
├── package.json                # Extension manifest and scripts
└── README.md                   # This file
```

## Testing & Quality

- Run `npm test` to execute the smoke tests in a headless VS Code instance.
- Run `npm run lint` to enforce TypeScript linting rules (optional).
- Run `npm run format` to apply Prettier formatting across the source tree.

## Next Steps

- Expand LM Studio coverage with richer prompt templating, error reporting, and telemetry.
- Add orchestrator-level telemetry for LM Studio health and retry states.

## Additional Documentation

- [`docs/lm-studio-integration.md`](docs/lm-studio-integration.md): High-level integration design covering orchestrator responsibilities, data flow, and testing strategy.
- [`docs/marketplace-listing.md`](docs/marketplace-listing.md): Ready-to-polish Marketplace listing copy, asset checklist, and submission guidance.
- Persist richer telemetry snapshots across sessions for longitudinal insights.
- Add visual dashboards (webviews) for deeper exploration of strategic guidance.
- Introduce team collaboration surfaces backed by shared storage.

## License

CodeObserver Preview is licensed under the [Apache License 2.0](../LICENSE).
