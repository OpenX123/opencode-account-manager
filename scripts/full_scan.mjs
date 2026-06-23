import fs from "fs";
import path from "path";

const roots = [
  "C:/Users/qingfeng/.config/opencode",
  "C:/Users/qingfeng/AppData/Roaming/opencode",
  "D:/qingfeng/Documents/1.20.1/skills-main/skills",
];

let issues = 0;

function checkFile(fp) {
  const ext = path.extname(fp);
  if (![".json", ".jsonc", ".tmp"].includes(ext) && ext !== "") return;
  if (fp.includes("node_modules") || fp.includes("EBWebView")) return;

  let s;
  try { s = fs.readFileSync(fp, "utf8"); } catch { return; }

  const stack = [];
  let inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c);
    if (c === "}") {
      if (stack.pop() !== "{") {
        console.log("  MISMATCH } at pos " + i + " in " + fp);
        issues++;
        return;
      }
    }
    if (c === "]") {
      if (stack.pop() !== "[") {
        console.log("  MISMATCH ] at pos " + i + " in " + fp);
        issues++;
        return;
      }
    }
  }
  if (stack.length !== 0) {
    console.log("  " + stack.length + " unclosed in " + fp);
    issues++;
  }
}

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git") continue;
      walk(fp);
    } else {
      checkFile(fp);
    }
  }
}

console.log("=== OpenCode Full Scan ===\n");
for (const root of roots) {
  console.log("[" + root + "]");
  walk(root);
}
if (issues === 0) console.log("\nAll clear. No JSON issues found.");
else console.log("\n" + issues + " issue(s) found.");
