# Research basis

This skill is built around data minimization, deterministic preprocessing, and tool-mediated access rather than direct model access to raw datasets.

## Core claims

1. Business data privacy controls from model vendors are useful but do not replace minimizing what the model sees.
2. Tool gateways and hooks are stronger than prompt-only instructions because they create deterministic enforcement points.
3. Aggregation, aliasing, and bounded releases reduce disclosure risk while preserving enough signal for ranking, diagnosis, and recommendations.
4. Differential privacy is relevant when repeated aggregate release or reconstruction risk matters, but it is optional rather than the default for every workflow.

## Source-backed rationale

### OpenAI enterprise privacy

OpenAI states that business data is not used to train models by default and emphasizes ownership, retention controls, and access controls. That supports using enterprise controls as a baseline, but it does not imply that raw sensitive tables should be sent unchanged to a model.

Source:
- https://openai.com/policies/api-data-usage-policies/

### Anthropic Claude Code hooks

Anthropic documents hooks as deterministic commands that run at lifecycle events such as `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`. This is the direct basis for enforcing analysis policy outside the model’s discretion.

Sources:
- https://docs.anthropic.com/en/docs/claude-code/hooks
- https://docs.anthropic.com/en/docs/claude-code/hooks-guide

### Anthropic Claude Code best practices

Anthropic’s Claude Code guidance emphasizes giving the agent ways to verify work and using tools/plugins/hooks rather than relying on long conversational context. That supports the design choice to move validation and sanitization into scripts.

Sources:
- https://code.claude.com/docs/en/best-practices
- https://www.anthropic.com/engineering/claude-code-best-practices

### Differential privacy

The U.S. Census describes differential privacy as a formal disclosure-avoidance framework that adds noise to published statistics to reduce reconstruction risk. This supports offering differential privacy as an optional stronger control for repeatedly shared aggregate outputs.

Sources:
- https://www.census.gov/library/fact-sheets/2021/differential-privacy-and-the-2020-census.html
- https://www.census.gov/programs-surveys/decennial-census/decade/2020/planning-management/process/disclosure-avoidance/differential-privacy.html

## Design implications

- The safe default is local analytics plus sanitized release artifacts.
- Hooks and validators are enforcement boundaries, not documentation.
- The skill should preserve lineage so blocked releases can explain which source columns caused the violation.
- The first benchmark should compare raw prompting against sanitized artifacts on both utility and leakage rate.
