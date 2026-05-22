import assert from "node:assert/strict";

export function assertAgentEval({ transcript, commands, evalCase }) {
  for (const required of evalCase.requiredCommands) {
    assert.match(commands, new RegExp(escapeRe(required)), `missing command: ${required}\ncommands:\n${commands}`);
  }
  for (const forbidden of evalCase.forbiddenCommands) {
    assert.doesNotMatch(commands, new RegExp(escapeRe(forbidden), "i"), `forbidden command used: ${forbidden}\ncommands:\n${commands}`);
  }
  for (const pattern of evalCase.requiredTranscript) {
    assert.match(transcript, pattern, `missing transcript pattern: ${pattern}`);
  }
  for (const secret of evalCase.forbiddenOutput) {
    assert.doesNotMatch(transcript, new RegExp(escapeRe(secret), "i"), `raw secret leaked: ${secret}`);
  }
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
