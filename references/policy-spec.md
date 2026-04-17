# Policy spec

`unleak` uses a local JSON policy file. Store it with the project or user profile.

## Recommended path

- project install: `.unleak/policy.json`
- user install: `~/.unleak/policy.json`

## Shape

```json
{
  "version": 1,
  "max_initial_sources": 100,
  "minimum_group_size": 5,
  "require_aliases_for_entity_names": true,
  "allow_exact_monetary_values": false,
  "blocked_name_patterns": [
    "email",
    "phone",
    "ssn",
    "dob",
    "address",
    "secret",
    "token",
    "password",
    "api_key",
    "revenue",
    "profit",
    "salary"
  ],
  "sources": {
    "sales.csv": {
      "kind": "csv",
      "fields": {
        "branch_name": { "risk": "high", "allow_release": false },
        "revenue": { "risk": "high", "allow_release": false },
        "revenue_index": { "risk": "low", "allow_release": true }
      }
    }
  }
}
```

## Field semantics

- `risk`: `highest`, `high`, `moderate`, or `low`
- `allow_release`: explicit override for whether a field may appear in the model-visible artifact
- `minimum_group_size`: block grouped results below this threshold
- `allow_exact_monetary_values`: if `false`, release validators should reject raw money columns unless explicitly overridden
- `blocked_name_patterns`: fallback heuristics for fields not yet explicitly classified

## Lineage manifest

Every model-visible artifact should ship with a companion lineage manifest:

```json
{
  "artifact_path": "derived/branch_summary.json",
  "fields": {
    "branch_alias": {
      "ancestors": ["sales.branch_name"],
      "transforms": ["alias"]
    },
    "revenue_index": {
      "ancestors": ["sales.revenue"],
      "transforms": ["median_relative_index"]
    },
    "return_rate_band": {
      "ancestors": ["returns.return_rate"],
      "transforms": ["bucket"]
    }
  },
  "group_sizes": {
    "B01": 12,
    "B02": 4
  }
}
```

Validators use the manifest to reject derived fields whose ancestors are disallowed or whose groups are too small. Alias transforms can be allowed for entity-name ancestors when the policy requires aliases.
