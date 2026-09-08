#!/usr/bin/env node
/**
 * CODEXA CLI — Node.js entry shim
 *
 * This thin wrapper is the `bin/codexa` entry point installed by `npm install -g codexa`.
 * It resolves the correct pre-compiled binary for the current platform and delegates to it.
 *
 * Resolution order:
 *   1. If Bun is available in PATH → delegate to `bun run <source>` (for dev installs)
 *   2. Else → locate the pre-compiled binary in the package's `bin/` directory
 *   3. If no binary found → print a helpful error with download instructions
 */

"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const { join } = require("node:path");
const os = require("node:os");

const PKG_DIR = join(__dirname, "..");

// ---------------------------------------------------------------------------
// Locate the compiled binary for this platform
// ---------------------------------------------------------------------------

function getPlatformBinaryName() {
  const platform = os.platform();   // 'darwin' | 'linux' | 'win32'
  const arch = os.arch();           // 'x64' | 'arm64'

  if (platform === "darwin" && arch === "arm64") return "codexa-darwin-arm64";
  if (platform === "darwin" && arch === "x64")   return "codexa-darwin-x64";
  if (platform === "linux"  && arch === "x64")   return "codexa-linux-x64";
  if (platform === "linux"  && arch === "arm64") return "codexa-linux-arm64";
  if (platform === "win32"  && arch === "x64")   return "codexa-windows-x64.exe";
  if (platform === "win32"  && arch === "arm64") return "codexa-windows-arm64.exe";
  return null;
}

function findBinary() {
  const name = getPlatformBinaryName();
  if (!name) return null;

  // Check package bin/ directory (populated by postinstall or bundled)
  const inBin = join(PKG_DIR, "bin", "native", name);
  if (existsSync(inBin)) return inBin;

  // Check artifacts/ directory (present in source checkouts)
  const artifactMap = {
    "codexa-darwin-arm64":   join(PKG_DIR, "..", "..", "artifacts", "darwin-arm64", "codexa"),
    "codexa-darwin-x64":     join(PKG_DIR, "..", "..", "artifacts", "darwin-x64", "codexa"),
    "codexa-linux-x64":      join(PKG_DIR, "..", "..", "artifacts", "linux-x64", "codexa"),
    "codexa-linux-arm64":    join(PKG_DIR, "..", "..", "artifacts", "linux-arm64", "codexa"),
    "codexa-windows-x64.exe":   join(PKG_DIR, "..", "..", "artifacts", "windows-x64", "codexa.exe"),
    "codexa-windows-arm64.exe": join(PKG_DIR, "..", "..", "artifacts", "windows-arm64", "codexa.exe"),
  };
  const fromArtifacts = artifactMap[name];
  if (fromArtifacts && existsSync(fromArtifacts)) return fromArtifacts;

  return null;
}

// ---------------------------------------------------------------------------
// Check for Bun (development / source installs)
// ---------------------------------------------------------------------------

function hasBun() {
  try {
    execFileSync("bun", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

// Try pre-compiled binary first (fastest, works everywhere)
const binary = findBinary();
if (binary) {
  const result = spawnSync(binary, args, {
    stdio: "inherit",
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

// Fall back to Bun (works in source/dev installs)
if (hasBun()) {
  const entrypoint = join(PKG_DIR, "src", "index.tsx");
  if (existsSync(entrypoint)) {
    const result = spawnSync("bun", ["run", entrypoint, ...args], {
      stdio: "inherit",
      env: process.env,
      cwd: process.cwd(),
    });
    process.exit(result.status ?? 0);
  }
}

// Nothing found — print helpful error
const name = getPlatformBinaryName();
console.error(`
CODEXA: Could not find a compatible binary for your platform (${os.platform()}/${os.arch()}).

If you installed via npm, the binary may not have downloaded correctly.
Try reinstalling:

  npm install -g codexa

If you cloned from GitHub, install Bun first:

  curl -fsSL https://bun.sh/install | bash

Then run:

  cd codexa
  bun install
  bun run packages/cli/src/index.tsx

Expected binary: ${name ?? "unknown platform"}
Package dir:     ${PKG_DIR}
`);
process.exit(1);
