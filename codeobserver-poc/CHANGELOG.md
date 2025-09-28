# Changelog

All notable changes to CodeObserver will be documented in this file. This project uses [Semantic Versioning](https://semver.org/) and timestamps follow ISO 8601.

## [0.1.1] - 2025-09-29
### Added
- Manual activation command (`CodeObserver: Activate`) that defers monitoring until requested and updates the status bar guidance.
- LM Studio model picker command that queries installed models via the CLI helper and writes the selection to workspace settings.

### Changed
- Extension manifest now declares the activation event explicitly while keeping monitoring opt-in.
- Documentation refreshed to reflect manual activation workflow and customizable LM Studio defaults.
- Activity monitor wiring now initializes lazily, reducing background work when the extension loads.

### Fixed
- Resolved packaging validation complaints about missing `activationEvents` after switching to command-based activation.

## [0.1.0] - 2025-09-27
### Added
- Automated GitHub Actions release workflow that builds and uploads VSIX assets when a release is published.
- Continuous integration pipeline for linting, testing, and packaging checks on every push and pull request.

### Changed
- Promoted the extension to the `0.1.0` general availability release with updated metadata and licensing bundles for Marketplace submission.

### Notes
- Generate the Marketplace-ready VSIX by publishing a GitHub release or running the Release workflow manually.

## [0.1.0-preview.1] - 2025-09-27
### Added
- Renamed the extension to **CodeObserver Preview** and bumped the version to `0.1.0-preview.1`.
- Documented manual VSIX installation steps and preview limitations for early adopters.
- Prepared the preview release package metadata for distribution outside the Marketplace.

### Fixed
- Clarified LM Studio requirements and recommended verbose logging for diagnostics during the preview.

### Notes
- This is the first public preview build; expect rapid iteration and breaking changes while feedback is collected.
