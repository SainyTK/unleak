# Support

Use the lightest public channel that fits the issue, and keep raw sensitive data out of all reports.

## Public issues

Open a GitHub issue when the topic is one of:

- documentation gaps
- install friction
- broken examples
- validator or hook behavior that can be reproduced without exposing private data
- benchmark or CI problems

Use the issue templates under `.github/ISSUE_TEMPLATE/` to keep reports actionable.

## Private security reports

Do not post public issues for:

- secrets exposure
- policy bypasses that could leak high-risk data
- workflows that allow raw sensitive records into model-visible context
- vulnerabilities that need coordinated disclosure

Until a dedicated security inbox or advisory process exists, contact the maintainer privately through the repository owner contact path and include:

- the affected workflow
- minimal reproduction details
- expected impact
- any immediate containment steps

## What to include

Good reports contain:

- exact commands or steps
- file paths or fixture names
- observed validator or hook output
- why the behavior is unsafe or broken

## Response expectations

This repository is still being productized. Response times may vary, but reports that include a clear safety impact and a small reproduction path are the easiest to act on quickly.
