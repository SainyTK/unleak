# FAQ

## What is `unleak`?

`unleak` is a skill scaffold for privacy-preserving coding-agent analysis. The model should work from validated derived artifacts instead of raw sensitive records.

## Does it replace vendor privacy promises?

No. Vendor privacy controls may help, but this project is about minimizing what the model sees in the first place.

## Can the model ever inspect raw rows?

The default answer is no when a deterministic local script can compute the needed result or produce a safer artifact. If a workflow truly requires raw-field access, that should be called out explicitly as an exception instead of happening by convenience.

## What counts as a safe release artifact?

A safe artifact is model-visible output that has been checked against policy and lineage rules. Typical patterns include aggregates, buckets, percentiles, aliases, and thresholded summaries.

## Does `unleak` do differential privacy?

Differential privacy is an optional stronger control for repeated aggregate release scenarios. It is not the default workflow.

## Which agent tools are first-class targets?

The current productization plan targets Claude Code and Codex first, with Gemini as a secondary target.

## Where should deeper usage docs live?

Longer install, threat-model, hook, benchmark, and release guidance should live under `docs/`. The future `README.md` should stay short and link outward.
