import fs from "fs";
import path from "path";

const roots = [
  "C:/Users/qingfeng/.config/opencode",
  "C:/Users/qingfeng/AppData/Roaming/opencode",
];

function checkFile(fp) {
  const ext = path.extname(fp);
  if (![".json", ".jsonc", ".tmp"].includes(ext) && ext !== "") return;
  // skip node_modules and binary dirs
  if (fp.includes("node_modules") || fp.includes("EBWebView")) return;

  let s;
  try {
    s = fs.readFileSync(fp, "utf8");
  } catch {
    return; // binary or inaccessible
  }

  const stack = [];
  let inStr = false,
    esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{" || c === "[") stack.push(c);
    if (c === "}") {
      if (stack.pop() !== "{") {
        console.log(`  ❌ ${fp}: MISMATCH '}' at position ${i}`);
        return;
      }
    }
    if (c === "]") {
      if (stack.pop() !== "[") {
        console.log(`  ❌ ${fp}: MISMATCH ']' at position ${i}`);
        return;
      }
    }
  }
  if (stack.length !== 0) {
    console.log(`  ⚠️  ${fp}: ${stack.length} unclosed bracket(s)`);
  }
}

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
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

console.log("Scanning OpenCode config files for JSON issues...\n");
for (const root of roots) {
  console.log(`[${root}]`);
  walk(root);
}
console.log("\nDone.");
