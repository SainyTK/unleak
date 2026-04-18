# Contributing to unleak

`unleak` is a privacy-preserving agent skill. Contributions should preserve the core invariant: the model should consume validated derived artifacts, not raw sensitive records.

## What to work on

Good early contributions include:

- packaging for supported agent surfaces
- hook install and uninstall flows
- runnable examples and demo ergonomics
- benchmark scenarios and result snapshots
- repo verification and CI checks
- documentation that clarifies threat model, install steps, and safe usage

If the change would alter validation policy, release rules, or risk classifications, explain the intended safety impact in the pull request.

## Development setup

1. Use Python 3.10 or newer.
2. Create and activate a virtual environment if you want an isolated local setup.
3. Install dev dependencies as your environment requires.
4. Run tests with `pytest -q`.

The only `SKILL.md` source of truth is `skills/unleak/SKILL.md`. Packaging manifests and tests should point to that file instead of maintaining generated `SKILL.md` copies elsewhere.

## Working norms

- Keep raw sensitive data out of the repository.
- Do not weaken validator behavior or hook enforcement without a strong reason and explicit explanation.
- Prefer deterministic local scripts over prompt-only guardrails.
- Preserve lineage between released fields and their source columns.
- Avoid large structural changes outside your owned scope when parallel work is in flight.

## Pull requests

Open focused pull requests with:

- a short problem statement
- the chosen approach and tradeoffs
- test coverage or a note explaining why tests are unchanged
- sample commands used for verification

When relevant, include before/after examples of:

- blocked raw access
- generated safe artifacts
- validator output
- hook behavior

## Issue triage

- Use bug reports for broken behavior, validator gaps, packaging drift, or documentation defects.
- Use feature requests for new install targets, workflow improvements, benchmark scenarios, or integration ideas.
- Use questions for ambiguity around safety posture, supported workflows, or adoption guidance.

## Code and docs style

- Prefer small, reviewable diffs.
- Keep documentation concrete and operational.
- When adding examples, bias toward reproducible local commands.
- When adding policy language, match the existing terminology: `highest`, `high`, `moderate`, `low`, derived artifact, lineage, release validation.

## Security and sensitive reports

Do not open a public issue for secrets exposure, unsafe release bypasses, or prompt/tool paths that could leak raw sensitive data. Follow [docs/support.md](docs/support.md) and use the private security contact path described there.
