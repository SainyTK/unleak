import crypto from "node:crypto";

export function hmacValue(secret, value) {
  if (value === null || value === undefined) return null;
  return `h_${crypto.createHmac("sha256", secret).update(String(value)).digest("hex").slice(0, 16)}`;
}

export function maskValue(value, options = {}) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  const mode = options.mode || "partial";
  if (mode === "email") {
    const [local, domain] = text.split("@");
    if (!domain) return partialMask(text, 1);
    return `${local.slice(0, 1)}***@${domain}`;
  }
  if (mode === "phone") {
    const digits = text.replace(/\D/g, "");
    const tail = digits.slice(-4);
    return `${"*".repeat(Math.max(0, digits.length - 4))}${tail}`;
  }
  return partialMask(text, Number(options.showLast ?? 4));
}

function partialMask(text, showLast) {
  const visible = Math.max(0, Math.min(showLast, text.length));
  return `${"*".repeat(text.length - visible)}${text.slice(text.length - visible)}`;
}

export function toCsv(rows, columns) {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
