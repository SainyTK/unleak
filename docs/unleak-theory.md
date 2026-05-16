# Theory Behind Unleak

`unleak` is based on a simple idea: let Claude Code help with structured data work, but reduce the chance that credentials or raw sensitive values are exposed to the model.

This is a practical guardrail for everyday workflows. It is not a sandbox, enterprise DLP, or a replacement for proper access control. If data must never leave the machine or organization network, use a local or self-hosted model instead.

## Core Principle

Before sending data to AI, decide column by column:

1. Does Claude need this data?
2. If yes, does Claude need the raw value?
3. If not, what safer representation is enough?

The goal is not to hide everything. The goal is to show the minimum useful form of data so Claude can still help with analysis, query writing, debugging, and summarization.

## Data Decision Tree

1. **Non-sensitive data -> show**

   Use when the value is safe for Claude to see directly.

   Examples:
   - order status
   - product category
   - transaction amount
   - created date
   - boolean flags

2. **PII -> masked**

   Use when the value identifies a person, but humans still need partial traceability.

   Examples:
   - email
   - phone number
   - account number
   - customer name

   Masking keeps only a small useful part, such as the last 4 digits or a partially hidden email.

3. **Secret but needs to join -> hashed / joinable**

   Use when Claude should not see the raw value, but the workflow still needs stable matching across rows or tables.

   Examples:
   - customer ID
   - member ID
   - account ID
   - transaction ID
   - foreign keys used for joins

   Hashing gives Claude a stable replacement value. `joinable` means the value can be used to connect tables, but should still be hidden or hashed before display.

4. **Secret -> hide**

   Use when Claude does not need the value and should not see it.

   Examples:
   - password
   - API key
   - access token
   - credential
   - private note
   - sensitive free-text comment

## Why This Works Well For Structured Data

Structured data has table names, column names, and types. That makes it possible to define policy at the column level.

For example:

| Column | Policy | Reason |
| --- | --- | --- |
| `status` | show | Non-sensitive business state |
| `email` | masked | PII, partial traceability useful |
| `customer_id` | hashed / joinable | Needed for joins, raw value not needed |
| `api_token` | hide | Secret, no reason to expose |

This is much easier than unstructured data, where sensitive information can appear anywhere inside text.

## Two Kinds Of Safety

`unleak` separates safety into two concerns:

1. **Credential safety**

   Claude should not read database passwords, tokens, or connection strings. Credentials stay in a local config file and Claude interacts with the database through controlled scripts.

2. **Data safety**

   Claude should only see query results after policy is applied. Sensitive columns are hidden, masked, hashed, or limited to join use.

## Practical Rule

Use this sentence as the mental model:

> Show what is safe, mask what needs traceability, hash what needs matching, hide what Claude does not need.

