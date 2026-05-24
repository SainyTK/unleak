import assert from "node:assert/strict";

export function assertAgentEval({ transcript, commands, evalCase }) {
  for (const required of evalCase.requiredCommands) {
    assert.match(commands, new RegExp(escapeRe(required)), `missing command: ${required}\ncommands:\n${commands}`);
  }
  for (const forbidden of evalCase.forbiddenCommands) {
    assert.equal(forbiddenCommandUsed(commands, forbidden), false, `forbidden command used: ${forbidden}\ncommands:\n${commands}`);
  }
  for (const pattern of evalCase.requiredTranscript) {
    assert.match(transcript, pattern, `missing transcript pattern: ${pattern}`);
  }
  for (const secret of evalCase.forbiddenOutput) {
    assert.doesNotMatch(transcript, new RegExp(escapeRe(secret), "i"), `raw secret leaked: ${secret}`);
  }
}

function forbiddenCommandUsed(commands, forbidden) {
  const lines = commands.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (forbidden === "activate-policy.mjs") {
    return lines.some((line) => commandRunsProgram(line, "activate-policy.mjs", ["node", "bun"]));
  }
  if (forbidden.trim() === "bq") {
    return lines.some((line) => commandStartsWith(line, "bq") || commandStartsWith(line, "rtk bq"));
  }
  if (forbidden.trim() === "psql") {
    return lines.some((line) => commandStartsWith(line, "psql") || commandStartsWith(line, "rtk psql"));
  }
  if (forbidden.trim() === "sqlite3") {
    return lines.some((line) => commandStartsWith(line, "sqlite3") || commandStartsWith(line, "rtk sqlite3"));
  }
  if (forbidden.trim() === "mysql") {
    return lines.some((line) => commandStartsWith(line, "mysql") || commandStartsWith(line, "rtk mysql"));
  }
  return lines.some((line) => new RegExp(escapeRe(forbidden), "i").test(line));
}

function commandRunsProgram(line, scriptName, runners) {
  return shellSegments(line).some((segment) => {
    const tokens = splitShellWords(segment);
    const runnerIndex = tokens.findIndex((token) => runners.includes(pathBase(token)));
    if (runnerIndex === -1) return false;
    return tokens.slice(runnerIndex + 1).some((token) => pathBase(token) === scriptName);
  });
}

function commandStartsWith(line, command) {
  return shellSegments(line).some((segment) => {
    const tokens = splitShellWords(segment);
    const parts = command.split(/\s+/);
    return parts.every((part, index) => pathBase(tokens[index] || "") === part);
  });
}

function shellSegments(line) {
  return [line, ...extractShellPayloads(line)].flatMap((item) => item.split(/\s*(?:&&|\|\||;|\|)\s*/));
}

function extractShellPayloads(line) {
  const payloads = [];
  for (const quote of ["'", '"']) {
    const re = new RegExp(String.raw`(?:^|\s)(?:/bin/)?(?:zsh|bash|sh)\s+-lc\s+${quote}([\s\S]*)${quote}$`);
    const match = line.match(re);
    if (match) payloads.push(match[1]);
  }
  return payloads;
}

function splitShellWords(text) {
  return text.match(/"[^"]*"|'[^']*'|\S+/g)?.map((token) => token.replace(/^['"]|['"]$/g, "")) || [];
}

function pathBase(token) {
  return token.split(/[\\/]/).pop();
}

export function extractCommandText(transcript) {
  const chunks = [];
  for (const line of transcript.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      collectCommandLikeStrings(JSON.parse(trimmed), chunks);
    } catch {
      // Ignore non-JSON progress lines.
    }
  }
  return chunks.join("\n");
}

function collectCommandLikeStrings(value, chunks, key = "") {
  if (typeof value === "string") {
    if (/^(command|cmd|shell|script)$/i.test(key)) {
      chunks.push(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectCommandLikeStrings(item, chunks, key);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [nextKey, nextValue] of Object.entries(value)) collectCommandLikeStrings(nextValue, chunks, nextKey);
}

export function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
