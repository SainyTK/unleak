# Release structure

This document defines the first public release shape for `unleak`.

## Release goals

A release should communicate:

- which install surfaces are supported
- which files are canonical versus generated
- what validation and example checks passed
- whether benchmark snapshots changed

## Release artifacts

Each release should produce:

- tagged source release
- concise release notes
- install surface summary
- mirrored rule and skill copies refreshed from canonical sources
- `unleak.skill` archive refreshed from `skills/unleak/SKILL.md`
- benchmark snapshot references
- migration notes if canonical paths or generated copies move

## Versioning policy

- Stay on `0.x` until the primary install surfaces and packaging paths are stable.
- Treat canonical file moves, manifest schema changes, and validator behavior changes as breaking changes.
- Version generated agent-specific bundles with the repository version for now.
- Call out benchmark snapshot changes in release notes whenever expected answers or overlap ratios move.

## First tagged release plan

Target the first serious release as `v0.1.0` with:

- canonical skill plus generated Codex, Claude, Cursor, Windsurf, Cline, and Copilot install surfaces
- hook installer and uninstall flow
- branch-analysis passing and blocked demo paths
- benchmark harness with committed retail and support scenarios
- eval harness with Claude Code and Codex live smoke snapshots
- CI plus repo verification
- public README and deeper docs

## Release checklist

1. Confirm canonical skill and generated copies are in sync.
2. Confirm `.claude-plugin/`, `.codex/`, `.cursor/`, `.windsurf/`, `.clinerules/`, and `.github/copilot-instructions.md` were generated from canonical sources.
3. Confirm `unleak.skill` opens and contains `unleak/SKILL.md`.
4. Run tests and repo verification checks.
5. Validate the flagship example end to end.
6. Confirm benchmark snapshots and eval snapshots are current or intentionally unchanged.
7. Draft release notes with install and migration guidance.
8. Tag the release and attach a concise summary of supported install targets.

## Relationship to README

The eventual `README.md` should link to this document for release policy details rather than embedding a long release-process section.
