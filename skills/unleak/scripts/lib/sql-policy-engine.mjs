import sqlParser from "node-sql-parser";
import { SafeError } from "./errors.mjs";
import { policyIndex } from "./policy.mjs";

const { Parser } = sqlParser;
const parser = new Parser();
const BAD_SQL = /\b(insert|update|delete|create|alter|drop|truncate|merge|begin|commit|rollback|pragma|copy|attach|detach|temporary|temp)\b/i;
const CLAUSE_NAMES = ["where", "group by", "having", "order by"];
const AGG_FUNCS = new Set(["count", "sum", "avg", "min", "max"]);
const SCALAR_FUNCS = new Set(["abs", "cast", "coalesce", "date", "date_trunc", "julianday", "lower", "nullif", "round", "strftime", "upper"]);
const BIGQUERY_ALIAS_KEYWORDS = "on|where|join|left|right|inner|outer|full|cross|group|order|having|limit|union|select|by";
const BIGQUERY_TABLE_REF = new RegExp(`\\b(from|join)\\s+([A-Za-z_][A-Za-z0-9_]*)(?:\\s+(?:as\\s+)?(?!(${BIGQUERY_ALIAS_KEYWORDS})\\b)([A-Za-z_][A-Za-z0-9_]*))?`, "gi");

export function stripSqlComments(sql) {
  return String(sql || "")
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

export function validateAndPlan(sql, schema, policy, options = {}) {
  const cleanSql = stripSqlComments(sql).replace(/;\s*$/, "").trim();
  if (!cleanSql) throw new SafeError("SQL_REQUIRED");
  if ((cleanSql.match(/;/g) || []).length > 0) throw new SafeError("SQL_MULTIPLE_STATEMENTS");
  if (BAD_SQL.test(cleanSql)) throw new SafeError("SQL_FORBIDDEN_STATEMENT");
  if (options.dialect === "bigquery") validateBigQuerySqlSubset(cleanSql);
  parseSelect(cleanSql, options.dialect);
  if (/\b(intersect|except)\b/i.test(cleanSql)) throw new SafeError("SQL_SET_OPERATOR_UNSUPPORTED");
  if (/\bunion(?:\s+all)?\b/i.test(cleanSql)) return validateUnion(cleanSql, schema, policy, options);

  const { sqlWithoutCtes, ctes } = extractCtes(cleanSql, schema, policy, options);
  const { contextSql, subqueries } = extractFromSubqueries(sqlWithoutCtes, schema, policy, options);
  for (const [name, subquery] of subqueries) ctes.set(name, subquery);
  const ctx = buildContext(contextSql, schema, policy, ctes, options);
  validateForbiddenObjectMentions(cleanSql, ctx);
  validateClauses(contextSql, ctx);
  validateJoins(contextSql, ctx);
  const selectList = extractSelectList(contextSql);
  const planned = planSelectList(selectList, ctx, options);
  if (isDistinctSelect(contextSql) && planned.transforms.some((transform) => transform.sourcePolicy !== "visible")) {
    throw new SafeError("SQL_PROTECTED_COLUMN_IN_DISTINCT");
  }
  const rewrittenSql = `${cleanSql.slice(0, cleanSql.length - sqlWithoutCtes.length)}${replaceSelectList(sqlWithoutCtes, planned.sqlItems.join(", "))}`;
  validateOrderByAllowed(contextSql, planned.outputColumns, ctx);
  return {
    originalSql: cleanSql,
    rewrittenSql,
    outputColumns: planned.outputColumns,
    transforms: planned.transforms,
    columnsRemoved: planned.columnsRemoved
  };
}

function validateUnion(sql, schema, policy, options = {}) {
  const unionParts = splitUnion(sql);
  if (unionParts.length < 2) throw new SafeError("SQL_INVALID");
  const plans = unionParts.map((part) => validateAndPlan(part.sql, schema, policy, options));
  const first = plans[0];
  for (const plan of plans.slice(1)) {
    if (JSON.stringify(plan.outputColumns) !== JSON.stringify(first.outputColumns)) throw new SafeError("SQL_UNION_OUTPUT_MISMATCH");
    if (JSON.stringify(plan.transforms.map(({ type }) => type)) !== JSON.stringify(first.transforms.map(({ type }) => type))) {
      throw new SafeError("SQL_UNION_POLICY_MISMATCH");
    }
  }
  let rewrittenSql = plans[0].rewrittenSql;
  for (let i = 1; i < plans.length; i += 1) {
    rewrittenSql += ` ${unionParts[i].operator} ${plans[i].rewrittenSql}`;
  }
  return { ...first, rewrittenSql };
}

function parseSelect(sql, dialect = undefined) {
  try {
    const ast = parser.astify(sql, { database: parserDialect(dialect) });
    const roots = Array.isArray(ast) ? ast : [ast];
    if (roots.length !== 1 || roots[0].type !== "select") throw new SafeError("SQL_SELECT_ONLY");
  } catch (error) {
    if (error instanceof SafeError) throw error;
    throw new SafeError("SQL_INVALID");
  }
}

export function qualifyBigQuerySql(sql, schema) {
  if (!schema.namespace?.projectId || !schema.namespace?.datasetId) throw new SafeError("SCHEMA_INVALID");
  validateBigQuerySqlSubset(sql);
  const qualified = sql.replace(BIGQUERY_TABLE_REF, (full, keyword, table, _reserved, alias) => {
    const nextAlias = alias || table;
    if (!schema.objects.some((object) => object.name === table)) return full;
    return `${keyword} \`${escapeBacktick(schema.namespace.projectId)}.${escapeBacktick(schema.namespace.datasetId)}.${escapeBacktick(table)}\` AS ${nextAlias}`;
  });
  return qualified.replace(/"([^"]+)"/g, (_match, ident) => `\`${ident.replaceAll("`", "``")}\``);
}

function validateBigQuerySqlSubset(sql) {
  if (/`/.test(sql)) throw new SafeError("BIGQUERY_QUALIFIED_TABLE_UNSUPPORTED");
  if (/\bfor\s+system_time\s+as\s+of\b/i.test(sql)) throw new SafeError("BIGQUERY_SYSTEM_TIME_UNSUPPORTED");
  const refs = sql.matchAll(/\b(from|join)\s+([^\s(),]+)(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi);
  for (const match of refs) {
    const table = match[2];
    if (table.includes(".")) throw new SafeError("BIGQUERY_QUALIFIED_TABLE_UNSUPPORTED");
    if (table.includes("*")) throw new SafeError("BIGQUERY_WILDCARD_TABLE_UNSUPPORTED");
    if (table.includes("@")) throw new SafeError("BIGQUERY_TABLE_DECORATOR_UNSUPPORTED");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) throw new SafeError("BIGQUERY_TABLE_NAME_UNSUPPORTED");
  }
}

function parserDialect(dialect) {
  if (dialect === "bigquery") return "bigquery";
  if (dialect === "mysql") return "mysql";
  if (dialect === "postgres") return "postgresql";
  return "postgresql";
}

function escapeBacktick(value) {
  return String(value).replaceAll("`", "``");
}

function buildContext(sql, schema, policy, ctes = new Map(), options = {}) {
  const objects = new Map(schema.objects.map((object) => [object.name, object]));
  const policies = policyIndex(policy);
  for (const [name, cte] of ctes) {
    objects.set(name, cte.object);
    policies.set(name, cte.policy);
  }
  const aliases = new Map();
  const tableRegex = /\b(from|join)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?/gi;
  for (const match of sql.matchAll(tableRegex)) {
    const table = match[2];
    const alias = match[3] && !/^(on|where|join|left|right|inner|outer|full|cross|group|order|having|limit)$/i.test(match[3]) ? match[3] : table;
    const object = objects.get(table);
    const objectPolicy = policies.get(table);
    if (!object || !objectPolicy) throw new SafeError("SQL_UNKNOWN_OBJECT");
    if (objectPolicy.objectPolicy === "disabled") throw new SafeError("SQL_DISABLED_OBJECT");
    aliases.set(alias, { alias, sqlAlias: alias, object, policy: objectPolicy });
    aliases.set(table, { alias: table, sqlAlias: alias, object, policy: objectPolicy });
  }
  if (aliases.size === 0) throw new SafeError("SQL_UNKNOWN_OBJECT");
  return { schema, policy, aliases, objects, policies, dialect: options.dialect, multiObject: new Set([...aliases.values()].map((item) => item.object.name)).size > 1 };
}

function validateForbiddenObjectMentions(sql, ctx) {
  for (const [name, objectPolicy] of ctx.policies) {
    if (objectPolicy.objectPolicy === "disabled" && new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(sql)) {
      throw new SafeError("SQL_DISABLED_OBJECT");
    }
  }
}

function validateClauses(sql, ctx) {
  for (const clause of CLAUSE_NAMES) {
    const text = extractClause(sql, clause);
    if (!text) continue;
    if (clause === "order by") validateOrderBy(text);
    for (const ref of findColumnRefs(text, ctx)) {
      if (!isColumnAllowedInClause(ref, clause)) throw new SafeError(`SQL_PROTECTED_COLUMN_IN_${clause.replaceAll(" ", "_").toUpperCase()}`);
    }
    validateFunctions(text, true);
  }
}

function isColumnAllowedInClause(ref, clause) {
  const capability = capabilityForClause(clause);
  if (hasCapability(ref, capability)) return true;
  if (clause === "group by" && !ref.policyEntry.capabilities) return true;
  return false;
}

function capabilityForClause(clause) {
  if (clause === "where" || clause === "having") return "filter";
  if (clause === "group by") return "group";
  if (clause === "order by") return "sort";
  return null;
}

function hasCapability(ref, capability) {
  if (!capability) return false;
  const explicit = ref.policyEntry.capabilities;
  if (explicit !== undefined) return explicit.includes(capability);
  if (ref.policy === "visible") return ["select", "filter", "group", "sort", "join", "aggregate", "expression"].includes(capability);
  if (ref.policy === "joinable") return ["select", "join", "group"].includes(capability);
  if (ref.policy === "masked" || ref.policy === "hashed") return ["select", "group"].includes(capability);
  if (ref.policy === "hidden") return capability === "group";
  return false;
}

function validateOrderByAllowed(sql, outputColumns, ctx) {
  const text = extractClause(sql, "order by");
  if (!text) return;
  const allowed = new Set(outputColumns);
  for (const item of splitTopLevel(text)) {
    const normalized = item.trim().replace(/\s+(asc|desc)\s*$/i, "").replace(/^"|"$/g, "");
    if (allowed.has(normalized)) continue;
    const direct = directRef(normalized, ctx);
    if (direct && hasCapability(direct, "sort")) continue;
    throw new SafeError("SQL_ORDER_BY_OUTPUT_ALIAS_ONLY");
  }
}

function validateOrderBy(text) {
  if (/(^|,)\s*\d+\s*(,|$)/.test(text)) throw new SafeError("SQL_ORDER_BY_ORDINAL_REJECTED");
}

function validateJoins(sql, ctx) {
  const joinRegex = /\bjoin\s+[A-Za-z_][A-Za-z0-9_]*(?:\s+(?:as\s+)?[A-Za-z_][A-Za-z0-9_]*)?\s+on\s+([\s\S]*?)(?=\b(?:join|where|group\s+by|having|order\s+by|limit)\b|$)/gi;
  for (const match of sql.matchAll(joinRegex)) {
    const onText = match[1];
    for (const condition of onText.split(/\band\b/i)) {
      const eq = condition.match(/^\s*([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s*=\s*([A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*)\s*$/i);
      if (!eq) {
        for (const ref of findColumnRefs(condition, ctx)) {
          if (ref.policy !== "visible") throw new SafeError("SQL_JOINABLE_JOIN_REJECTED");
        }
        continue;
      }
      const left = resolveRef(eq[1], ctx);
      const right = resolveRef(eq[2], ctx);
      if (![left.policy, right.policy].every((policy) => policy === "visible" || policy === "joinable")) {
        throw new SafeError("SQL_JOINABLE_JOIN_REJECTED");
      }
    }
  }
}

function planSelectList(selectList, ctx, options = {}) {
  const outputColumns = [];
  const sqlItems = [];
  const transforms = [];
  const columnsRemoved = [];
  const names = new Set();
  for (const item of splitTopLevel(selectList)) {
    const trimmed = item.trim();
    if (trimmed === "*") {
      for (const { object, policy, alias } of uniqueAliasObjects(ctx)) {
      addStarColumns({ object, policy, sqlAlias: alias, outputAlias: ctx.multiObject ? alias : null, outputColumns, sqlItems, transforms, columnsRemoved, names, dialect: ctx.dialect });
      }
      continue;
    }
    const star = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\.\*$/);
    if (star) {
      const entry = ctx.aliases.get(star[1]);
      if (!entry) throw new SafeError("SQL_UNKNOWN_OBJECT");
      addStarColumns({ object: entry.object, policy: entry.policy, sqlAlias: entry.sqlAlias, outputAlias: ctx.multiObject ? star[1] : null, outputColumns, sqlItems, transforms, columnsRemoved, names, dialect: ctx.dialect });
      continue;
    }
    const alias = explicitAlias(trimmed);
    const expression = alias ? trimmed.slice(0, alias.index).trim() : trimmed;
    const direct = directRef(expression, ctx);
    if (direct) {
      if (direct.policy === "hidden") throw new SafeError("SQL_HIDDEN_COLUMN_SELECTED");
      const outName = alias?.name || direct.column.name;
      addName(names, outName);
      outputColumns.push(outName);
      sqlItems.push(`${direct.sql} AS ${quoteIdent(outName, options.dialect)}`);
      transforms.push(transformFor(outName, direct.policy, direct.policyEntry));
      continue;
    }
    if (!alias) throw new SafeError("SQL_DERIVED_ALIAS_REQUIRED");
    validateFunctions(expression, false);
    const requiredCapabilities = expressionCapabilities(expression);
    for (const ref of findColumnRefs(expression, ctx)) {
      for (const capability of requiredCapabilities) {
        if (!hasCapability(ref, capability)) throw new SafeError("SQL_PROTECTED_COLUMN_IN_EXPRESSION");
      }
    }
    addName(names, alias.name);
    outputColumns.push(alias.name);
    sqlItems.push(`${expression} AS ${quoteIdent(alias.name, options.dialect)}`);
    transforms.push({ column: alias.name, type: "visible", sourcePolicy: "visible" });
  }
  return { outputColumns, sqlItems, transforms, columnsRemoved };
}

function expressionCapabilities(expression) {
  const capabilities = new Set();
  for (const match of expression.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    if (AGG_FUNCS.has(match[1].toLowerCase())) capabilities.add("aggregate");
  }
  if (capabilities.size === 0) capabilities.add("expression");
  return capabilities;
}

function addStarColumns({ object, policy, sqlAlias, outputAlias, outputColumns, sqlItems, transforms, columnsRemoved, names, dialect = undefined }) {
  for (const column of object.columns) {
    const policyEntry = policy.columnsByName.get(column.name);
    if (policyEntry.policy === "hidden") {
      columnsRemoved.push(column.name);
      continue;
    }
    const outName = outputAlias ? `${outputAlias}.${column.name}` : column.name;
    addName(names, outName);
    outputColumns.push(outName);
    sqlItems.push(`${quoteIdent(sqlAlias || object.name, dialect)}.${quoteIdent(column.name, dialect)} AS ${quoteIdent(outName, dialect)}`);
    transforms.push(transformFor(outName, policyEntry.policy, policyEntry));
  }
}

function transformFor(column, policy, policyEntry) {
  if (policy === "masked") return { column, type: "masked", sourcePolicy: "masked", maskOptions: policyEntry.maskOptions || {} };
  if (policy === "hashed" || policy === "joinable") return { column, type: "hashed", sourcePolicy: policy };
  return { column, type: "visible", sourcePolicy: "visible" };
}

function directRef(expression, ctx) {
  const qualified = expression.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?\."?([A-Za-z_][A-Za-z0-9_]*)"?$/);
  if (qualified) return resolveRef(`${qualified[1]}.${qualified[2]}`, ctx);
  const bare = expression.match(/^"?([A-Za-z_][A-Za-z0-9_]*)"?$/);
  if (!bare) return null;
  return resolveBareColumn(bare[1], ctx);
}

function resolveRef(ref, ctx) {
  const [alias, columnName] = ref.replaceAll('"', "").split(".");
  const entry = ctx.aliases.get(alias);
  if (!entry) throw new SafeError("SQL_UNKNOWN_OBJECT");
  const column = entry.object.columns.find((item) => item.name === columnName);
  const policyEntry = entry.policy.columnsByName.get(columnName);
  if (!column || !policyEntry) throw new SafeError("SQL_UNKNOWN_COLUMN");
  return { object: entry.object, column, policy: policyEntry.policy, policyEntry, sql: `${quoteIdent(entry.sqlAlias, ctx.dialect)}.${quoteIdent(column.name, ctx.dialect)}` };
}

function resolveBareColumn(columnName, ctx) {
  const matches = uniqueAliasObjects(ctx).filter(({ object }) => object.columns.some((column) => column.name === columnName));
  if (matches.length === 0) throw new SafeError("SQL_UNKNOWN_COLUMN");
  if (matches.length > 1) throw new SafeError("SQL_AMBIGUOUS_COLUMN");
  return resolveRef(`${matches[0].alias}.${columnName}`, ctx);
}

function findColumnRefs(text, ctx) {
  const searchText = stripStringLiterals(text);
  const refs = [];
  const qualified = /\b([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (const match of searchText.matchAll(qualified)) refs.push(resolveRef(`${match[1]}.${match[2]}`, ctx));
  const scrubbed = searchText.replace(qualified, " ");
  for (const token of scrubbed.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\b/g)) {
    const word = token[1];
    if (isSqlWord(word) || /^\d+$/.test(word)) continue;
    const ref = maybeBareColumn(word, ctx);
    if (ref) refs.push(ref);
  }
  return refs;
}

function stripStringLiterals(text) {
  return text.replace(/'(?:''|[^'])*'/g, "''").replace(/"(?:\\"|[^"])*"/g, '""');
}

function maybeBareColumn(word, ctx) {
  const matches = uniqueAliasObjects(ctx).filter(({ object }) => object.columns.some((column) => column.name === word));
  if (matches.length === 0) return null;
  if (matches.length > 1) throw new SafeError("SQL_AMBIGUOUS_COLUMN");
  return resolveRef(`${matches[0].alias}.${word}`, ctx);
}

function validateFunctions(text, allowAggregates) {
  for (const match of text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const fn = match[1].toLowerCase();
    if (isSqlWord(fn)) continue;
    if (SCALAR_FUNCS.has(fn)) continue;
    if (allowAggregates && AGG_FUNCS.has(fn)) continue;
    if (!allowAggregates && AGG_FUNCS.has(fn)) continue;
    throw new SafeError("SQL_FUNCTION_NOT_ALLOWED");
  }
}

function extractSelectList(sql) {
  const lower = sql.toLowerCase();
  const selectIdx = lower.indexOf("select");
  const fromIdx = findTopLevelKeyword(sql, "from", selectIdx + 6);
  if (selectIdx < 0 || fromIdx < 0) throw new SafeError("SQL_INVALID");
  return sql.slice(selectIdx + 6, fromIdx).replace(/^\s*distinct\s+/i, "");
}

function replaceSelectList(sql, replacement) {
  const lower = sql.toLowerCase();
  const selectIdx = lower.indexOf("select");
  const fromIdx = findTopLevelKeyword(sql, "from", selectIdx + 6);
  const distinct = /^\s*distinct\s+/i.test(sql.slice(selectIdx + 6, fromIdx));
  return `${sql.slice(0, selectIdx + 6)} ${distinct ? "DISTINCT " : ""}${replacement} ${sql.slice(fromIdx)}`;
}

function isDistinctSelect(sql) {
  const lower = sql.toLowerCase();
  const selectIdx = lower.indexOf("select");
  const fromIdx = findTopLevelKeyword(sql, "from", selectIdx + 6);
  return /^\s*distinct\s+/i.test(sql.slice(selectIdx + 6, fromIdx));
}

function extractCtes(sql, schema, policy, options = {}) {
  if (!/^\s*with\s/i.test(sql)) return { sqlWithoutCtes: sql, ctes: new Map() };
  let i = sql.search(/\bwith\b/i) + 4;
  const ctes = new Map();
  while (i < sql.length) {
    while (/\s|,/.test(sql[i])) i += 1;
    const nameMatch = sql.slice(i).match(/^([A-Za-z_][A-Za-z0-9_]*)\s+as\s*\(/i);
    if (!nameMatch) throw new SafeError("SQL_CTE_UNSUPPORTED");
    const name = nameMatch[1];
    i += nameMatch[0].length;
    const start = i;
    let depth = 1;
    let quote = null;
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      } else if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
      }
      i += 1;
    }
    if (depth !== 0) throw new SafeError("SQL_CTE_UNSUPPORTED");
    const innerSql = sql.slice(start, i - 1);
    const innerPlan = validateAndPlan(innerSql, schema, policy, options);
    ctes.set(name, cteFromPlan(name, innerPlan));
    const rest = sql.slice(i);
    if (/^\s*,/.test(rest)) continue;
    return { sqlWithoutCtes: sql.slice(i).trim(), ctes };
  }
  throw new SafeError("SQL_CTE_UNSUPPORTED");
}

function extractFromSubqueries(sql, schema, policy, options = {}) {
  let contextSql = "";
  const subqueries = new Map();
  let i = 0;
  while (i < sql.length) {
    const match = sql.slice(i).match(/\b(from|join)\s*\(/i);
    if (!match) {
      contextSql += sql.slice(i);
      break;
    }
    const absolute = i + match.index;
    contextSql += sql.slice(i, absolute) + `${match[1]} `;
    i = absolute + match[0].length;
    const start = i;
    let depth = 1;
    let quote = null;
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') {
        quote = ch;
      } else if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
      }
      i += 1;
    }
    if (depth !== 0) throw new SafeError("SQL_SUBQUERY_UNSUPPORTED");
    const innerSql = sql.slice(start, i - 1);
    const aliasMatch = sql.slice(i).match(/^\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*)/i);
    if (!aliasMatch) throw new SafeError("SQL_SUBQUERY_ALIAS_REQUIRED");
    const alias = aliasMatch[1];
    const innerPlan = validateAndPlan(innerSql, schema, policy, options);
    subqueries.set(alias, cteFromPlan(alias, innerPlan));
    contextSql += alias;
    i += aliasMatch[0].length;
  }
  return { contextSql, subqueries };
}

function cteFromPlan(name, plan) {
  const columns = plan.outputColumns.map((column) => ({ name: column }));
  return {
    object: { name, type: "view", columns },
    policy: {
      name,
      type: "view",
      objectPolicy: "enabled",
      columns,
      columnsByName: new Map(plan.transforms.map((transform) => [
        transform.column,
        { name: transform.column, policy: transform.sourcePolicy || transform.type, maskOptions: transform.maskOptions }
      ]))
    }
  };
}

function splitUnion(sql) {
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  const operators = [];
  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0) {
      const rest = sql.slice(i);
      const match = rest.match(/^\s+union(?:\s+all)?\s+/i);
      if (match) {
        parts.push({ sql: sql.slice(start, i).trim(), operator: operators.pop() || "" });
        operators.push(match[0].trim().toUpperCase());
        i += match[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push({ sql: sql.slice(start).trim(), operator: operators.pop() || "UNION" });
  for (let i = 1; i < parts.length; i += 1) parts[i].operator = /\bunion\s+all\b/i.test(sql) ? "UNION ALL" : "UNION";
  return parts;
}

function extractClause(sql, clause) {
  const start = findTopLevelKeyword(sql, clause);
  if (start < 0) return "";
  const after = start + clause.length;
  const endCandidates = ["where", "group by", "having", "order by", "limit"].filter((item) => item !== clause).map((item) => findTopLevelKeyword(sql, item, after)).filter((idx) => idx >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : sql.length;
  return sql.slice(after, end);
}

function findTopLevelKeyword(sql, keyword, from = 0) {
  const lower = sql.toLowerCase();
  let depth = 0;
  let quote = null;
  for (let i = from; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth === 0 && lower.slice(i, i + keyword.length) === keyword && wordBoundary(lower, i - 1) && wordBoundary(lower, i + keyword.length)) {
      return i;
    }
  }
  return -1;
}

function splitTopLevel(text) {
  const items = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      items.push(text.slice(start, i));
      start = i + 1;
    }
  }
  items.push(text.slice(start));
  return items.filter((item) => item.trim());
}

function explicitAlias(item) {
  const asMatch = item.match(/\s+as\s+"?([A-Za-z_][A-Za-z0-9_.]*)"?\s*$/i);
  if (asMatch) return { name: asMatch[1], index: asMatch.index };
  const bare = item.match(/\s+"?([A-Za-z_][A-Za-z0-9_.]*)"?\s*$/);
  if (bare && /[)\s+\-*/]/.test(item.slice(0, bare.index))) return { name: bare[1], index: bare.index };
  return null;
}

function uniqueAliasObjects(ctx) {
  const seen = new Set();
  const out = [];
  for (const entry of ctx.aliases.values()) {
    if (seen.has(entry.object.name)) continue;
    seen.add(entry.object.name);
    out.push(entry);
  }
  return out;
}

function addName(names, name) {
  if (names.has(name)) throw new SafeError("SQL_DUPLICATE_OUTPUT_NAME");
  names.add(name);
}

function isSqlWord(word) {
  return /^(select|from|join|left|right|inner|outer|full|cross|on|where|and|or|not|null|is|in|like|between|group|by|having|order|asc|desc|limit|offset|as|case|when|then|else|end|distinct|over|partition|true|false|count|sum|avg|min|max|cast|coalesce|round|date|date_trunc|lower|upper)$/i.test(word);
}

function wordBoundary(text, idx) {
  if (idx < 0 || idx >= text.length) return true;
  return !/[A-Za-z0-9_]/.test(text[idx]);
}

function escapeIdent(value) {
  return String(value).replaceAll('"', '""');
}

function quoteIdent(value, dialect = undefined) {
  if (dialect === "mysql") return `\`${String(value).replaceAll("`", "``")}\``;
  return `"${escapeIdent(value)}"`;
}

function escapeRe(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
