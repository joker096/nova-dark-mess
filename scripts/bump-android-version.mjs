import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  path.join(root, "package.json"),
  path.join(root, "src-tauri", "Cargo.toml"),
  path.join(root, "src-tauri", "tauri.conf.json"),
];

function bumpVersion(v) {
  const parts = v.split(".");
  if (parts.length !== 3 || !parts.every((p) => /^\d+$/.test(p))) {
    throw new Error(`Unexpected version format: ${v}`);
  }
  parts[2] = String(Number(parts[2]) + 1); // patch bump
  return parts.join(".");
}

let newVersion = "";
for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  const before = content;

  // Match "version": "x.y.z"  (package.json, tauri.conf.json)
  // Match version = "x.y.z"   (Cargo.toml)
  content = content.replace(
    /(version["\s:=]+["'])(\d+\.\d+\.\d+)(["'])/,
    (m, prefix, ver, suffix) => {
      newVersion = bumpVersion(ver);
      return `${prefix}${newVersion}${suffix}`;
    }
  );

  if (content === before) {
    console.error(`No version found in ${file}`);
    process.exit(1);
  }

  fs.writeFileSync(file, content);
  console.log(`Bumped ${path.relative(root, file)} → ${newVersion}`);
}

console.log(`\nNew version: ${newVersion}`);
