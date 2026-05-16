import fs from "node:fs";
import path from "node:path";
import { SafeError } from "./errors.mjs";

export function readJson(file, missingCode = "FILE_NOT_FOUND", invalidCode = "JSON_INVALID") {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") throw new SafeError(missingCode);
    throw new SafeError(missingCode);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SafeError(invalidCode);
  }
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function backupIfExists(file, backupDir) {
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(backupDir, `${path.basename(file)}.${stamp}.bak`);
  fs.copyFileSync(file, backup);
  return backup;
}
