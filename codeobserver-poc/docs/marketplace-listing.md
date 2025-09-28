# CodeObserver for Visual Studio Code

## Marketplace Summary
CodeObserver turns your editor into a strategic command center by blending GitHub Copilot completions with an always-on local AI observer. Ship faster with proactive insights, architectural guardrails, and release hygiene baked right into your workflow.

- **Category:** Productivity, AI-assisted development
- **Works with:** Visual Studio Code 1.84.0 or later (Windows, macOS, Linux)
- **License:** Apache 2.0 (commercial-friendly)
- **Pricing:** Free. Enterprise support and roadmap partnerships available on request.

## Highlight Reel
1. **Strategic Insight Stream** – Surfaces curated, high-signal insights about risky modules, drift from architectural goals, and TODO debt so you can act before regressions ship.
2. **Autonomous Workspace Analysis** – Optional LM Studio integration lets the extension run fully offline against your local open-source models for secure environments.
3. **Release Automation Ready** – GitHub Actions workflows, signed VSIX artifacts, and Marketplace-friendly packaging keep compliance teams happy.
4. **Instant Diagnostics** – Verbose logging + Insight History make it trivial to reproduce how and why recommendations were made.

## Feature Deep Dive
- **Insight Dashboard:** Hoverable summary with quick actions to open related files or run a full workspace sweep.
- **Workspace Analyzer:** Invoke `CodeObserver: Run Strategic Analysis` to score your project against customizable objectives (architecture consistency, critical module drift, mission alignment).
- **Live Objectives:** Configure `codeObserver.objectives` to align the AI observer with your product OKRs.
- **LM Studio Bridge:** Point `codeObserver.lmStudio.*` settings at any local LM Studio deployment for air-gapped inference and pick the model via the `CodeObserver: Select LM Studio Model` command.
- **Verbose Telemetry:** Enable `codeObserver.verboseLogging` when you need to audit every decision.

## Installation
1. Install Visual Studio Code 1.84.0 or later.
2. Search for **CodeObserver** in the Marketplace (or sideload the signed VSIX from GitHub Releases).
3. Reload VS Code and run the "CodeObserver: Show Latest Insight" command.

## Configuration & Requirements
```jsonc
// .vscode/settings.json
{
  "codeObserver.objectives": [
    "Maintain architectural consistency",
    "Protect critical modules",
    "Keep codebase aligned with objectives"
  ],
  "codeObserver.lmStudio.enabled": false,
  "codeObserver.lmStudio.cliPath": "C:/LMStudio/lms.exe",
  "codeObserver.lmStudio.model": "",
  "codeObserver.verboseLogging": false
}
```
- Node.js (optional) if you plan to run the extension tests locally.
- LM Studio CLI (optional) for on-device inference.

## Screenshots
> Replace the placeholders with final PNG assets before submission.
- ![Strategic insights panel](./images/marketplace/insight-panel.png)
- ![Workspace analyzer results](./images/marketplace/workspace-analyzer.png)
- ![Release automation dashboard](./images/marketplace/release-automation.png)

## Privacy & Data Handling
- Runs locally by default—no source code leaves your machine unless you enable optional LM Studio network features.
- Logging is opt-in and stored inside the workspace `.codeobserver` cache.
- Apache-2.0 license guarantees commercial use without royalties.

## Support & Feedback
- 📮 Issues & feature requests: [GitHub Issues](https://github.com/SatyamSaxena1/codeobserver-preview/issues)
- 💬 Discussions & roadmap: [GitHub Discussions](https://github.com/SatyamSaxena1/codeobserver-preview/discussions)
- 🤝 Enterprise partnership inquiries: `partnerships@codeobserver.app`

## Changelog & Roadmap Snippet
- **0.1.0 (GA):** Automated release workflow, CI lint/test gates, Marketplace metadata polish.
- **Upcoming:** Flutter & React Native playbooks, OSS policy scanning, advanced LM Studio prompt tuning UI.

## Localization
English (US) at launch. Community translation contributions welcome—open an issue and we will share the string catalog.

---
**Submission Checklist**
- [ ] Marketplace icon: 128x128 and 256x256 PNGs compressed
- [ ] Header banner: 1400x700 PNG (light + dark variants)
- [ ] Final screenshots exported at 1280x720
- [ ] Privacy statement uploaded
- [ ] VSIX signed and attached to GitHub Release
