# Threat model

`unleak` exists to reduce the chance that a coding agent sees raw sensitive data when deterministic local computation can provide a safer intermediate artifact instead.

## Primary risk

The main failure mode is accidental or convenience-driven exposure of raw records, sensitive fields, or reconstructible outputs to the model during analysis work.

Examples:

- direct dataset reads into the model context
- raw CSV snippets pasted into prompts
- tool runs that expose high-risk columns without prior sanitization
- derived artifacts that still reveal blocked fields, exact monetary values, or small-group data

## Enforcement model

The intended control stack is:

1. discover sources and classify fields
2. write a local policy describing blocked and allowed release patterns
3. compute results locally with deterministic scripts
4. validate the model-visible artifact and lineage
5. allow the model to see only the validated artifact

## What `unleak` tries to prevent

- release of `highest` and `high` risk fields into model-visible artifacts
- free-text leakage from human-authored content
- raw row-level exports framed as "analysis inputs"
- reconstruction through sparse groups or exact values when only coarse output is allowed
- silent drift between policy intent and what the model actually receives

## What `unleak` does not guarantee

`unleak` is not a full data-loss prevention platform and does not claim:

- confidential computing or enclave protection
- perfect resistance to every reconstruction attack
- automatic safety for arbitrary third-party tools
- safety if operators intentionally bypass validators or hook boundaries

## Open design questions

This document is a skeleton for deeper O3 work. The later expansion should add:

- adversary assumptions
- trusted and untrusted boundaries
- example attack paths and mitigations
- residual risks and operational guidance
