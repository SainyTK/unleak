import { SafeError } from "./errors.mjs";

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (["force", "active", "dry-run"].includes(key)) {
      args[key] = true;
    } else {
      const value = argv[i + 1];
      if (value === undefined) throw new SafeError("ARGUMENT_INVALID");
      args[key] = value;
      i += 1;
    }
  }
  return args;
}
