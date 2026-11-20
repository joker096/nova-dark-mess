import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const searchRoot = path.join(root, "src-tauri", "gen", "android", "app", "build", "outputs", "bundle");

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".aab")) out.push(full);
  }
  return out;
}

const bundles = walk(searchRoot);
if (!bundles.length) {
  console.error("No .aab found under", searchRoot);
  process.exit(1);
}

const newest = bundles
  .map((p) => ({ p, mtime: fs.statSync(p).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime)[0].p;

const propsPath = path.join(root, "src-tauri", "gen", "android", "app", "tauri.properties");
let version = "unknown";
let versionCode = "";
if (fs.existsSync(propsPath)) {
  const props = fs.readFileSync(propsPath, "utf8");
  const nameMatch = props.match(/tauri\.android\.versionName=(.+)/);
  const codeMatch = props.match(/tauri\.android\.versionCode=(.+)/);
  if (nameMatch) version = nameMatch[1].trim();
  if (codeMatch) versionCode = codeMatch[1].trim();
}

const stamp = new Date(fs.statSync(newest).mtime).toISOString().replace(/[:T]/g, "-").slice(0, 19);
const destName = versionCode
  ? `mess-${version}-${versionCode}.aab`
  : `mess-${version}.aab`;
const dest = path.join(root, destName);

fs.copyFileSync(newest, dest);
// Also keep stable aliases for convenience.
fs.copyFileSync(newest, path.join(root, "mess-latest.aab"));
fs.copyFileSync(newest, path.join(root, "Nova-Dark-Messenger.aab"));

const stat = fs.statSync(dest);
console.log(`Copied ${newest}`);
console.log(`-> ${dest}`);
console.log(`Version: ${version} (versionCode ${versionCode || "n/a"})`);
console.log(`Built: ${new Date(stat.mtime).toISOString()}`);
console.log(`Size: ${(stat.size / 1024 / 1024).toFixed(1)} MB`);

// Verify the bundle is signed (Google Play rejects unsigned AABs).
try {
  const jarsigner = process.platform === "win32" ? "jarsigner.exe" : "jarsigner";
  const { spawnSync } = await import("node:child_process");
  const verify = spawnSync(jarsigner, ["-verify", dest], { encoding: "utf8" });
  const verifyOutput = `${verify.stderr || ""}${verify.stdout || ""}`.trim();
  if (verify.status === 0 && !/jar is unsigned/i.test(verifyOutput)) {
    console.log("Signature: verified");
  } else {
    console.warn("WARNING: bundle signature could not be verified.");
    console.warn(verifyOutput.split(/\r?\n/).slice(0, 5).join("\n"));
  }
} catch {
  console.warn("WARNING: jarsigner not found; could not verify signature.");
}
