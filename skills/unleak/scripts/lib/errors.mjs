export class SafeError extends Error {
  constructor(code, message = code, details = undefined) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export function safeOk(payload = {}) {
  return JSON.stringify({ ok: true, ...payload }, null, 2);
}

export function safeFail(error) {
  const code = error?.code || "UNLEAK_ERROR";
  const message = error instanceof SafeError ? error.message : code;
  const payload = { ok: false, error: { code, message } };
  if (error instanceof SafeError && error.details) payload.error.details = error.details;
  return JSON.stringify(payload, null, 2);
}

export async function main(fn) {
  try {
    console.log(safeOk(await fn()));
  } catch (error) {
    console.log(safeFail(error));
    process.exitCode = 1;
  }
}

export function assertSafeName(name, label = "name") {
  if (!/^[A-Za-z0-9_-]+$/.test(String(name || ""))) {
    throw new SafeError("INVALID_NAME", `${label} must be filename-safe`);
  }
}
