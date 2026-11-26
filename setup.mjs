#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetDir = path.join(os.homedir(), ".gemini", "config", "plugins", "ai-studio-banana");

const filesToCopy = [
  "plugin.json",
  "mcp-server.mjs",
  "upscale.ps1",
  "README.md",
  "LICENSE",
  "skills/ai-studio-banana/SKILL.md",
];

fs.mkdirSync(targetDir, { recursive: true });
for (const rel of filesToCopy) {
  const src = path.join(__dirname, rel);
  const dst = path.join(targetDir, rel);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

const mcpConfig = {
  mcpServers: {
    "ai-studio-banana": {
      command: process.execPath.replace(/\\/g, "/"),
      args: [path.join(targetDir, "mcp-server.mjs").replace(/\\/g, "/")],
    },
  },
};
fs.writeFileSync(path.join(targetDir, "mcp_config.json"), JSON.stringify(mcpConfig, null, 2) + "\n", "utf8");

console.log("[ai-studio-banana] Installed successfully:");
console.log("  Node binary :", process.execPath);
console.log("  Plugin dir  :", targetDir);
console.log("  Next step   : Restart Antigravity, then configure your API Key via banana_configure.");
