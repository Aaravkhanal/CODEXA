#!/usr/bin/env node
/**
 * CODEXA postinstall script
 *
 * Downloads the pre-compiled platform binary from GitHub releases when
 * installing via `npm install -g codexa`.
 *
 * Skipped when:
 *   - CODEXA_SKIP_BINARY_DOWNLOAD=1 is set
 *   - Running in CI (CI=1) without explicit override
 *   - Bun is already available (dev/source installs)
 *   - The binary already exists
 */

"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, chmodSync, createWriteStream } = require("node:fs");
const { join } = require("node:path");
const https = require("node:https");
const os = require("node:os");

// Read version from package.json
const pkg = require("../package.json");
const VERSION = pkg.version;
const GITHUB_REPO = "Aaravkhanal/CODEXA";
const BINARY_DIR = join(__dirname, "..", "bin", "native");

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

function getPlatformTarget() {
  const platform = os.platform();
  const arch = os.arch();

  const map = {
    "darwin-arm64":  { artifact: "darwin-arm64",  filename: "codexa",         targetName: "codexa-darwin-arm64" },
    "darwin-x64":    { artifact: "darwin-x64",    filename: "codexa",         targetName: "codexa-darwin-x64" },
    "linux-x64":     { artifact: "linux-x64",     filename: "codexa",         targetName: "codexa-linux-x64" },
    "linux-arm64":   { artifact: "linux-arm64",   filename: "codexa",         targetName: "codexa-linux-arm64" },
    "win32-x64":     { artifact: "windows-x64",   filename: "codexa.exe",     targetName: "codexa-windows-x64.exe" },
    "win32-arm64":   { artifact: "windows-arm64", filename: "codexa.exe",     targetName: "codexa-windows-arm64.exe" },
  };

  return map[`${platform}-${arch}`] ?? null;
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const req = https.get(url, { headers: { "User-Agent": `codexa-installer/${VERSION}` } }, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        // Follow redirect
        file.destroy();
        download(res.headers.location, destPath).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on("finish", () => file.close(resolve));
    });
    req.on("error", reject);
    file.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Skip conditions
  if (process.env.CODEXA_SKIP_BINARY_DOWNLOAD === "1") {
    console.log("CODEXA: Skipping binary download (CODEXA_SKIP_BINARY_DOWNLOAD=1)");
    return;
  }

  const target = getPlatformTarget();
  if (!target) {
    console.log(`CODEXA: Unsupported platform ${os.platform()}/${os.arch()} — binary not downloaded.`);
    console.log("CODEXA: Install Bun (https://bun.sh) to run from source.");
    return;
  }

  const binaryPath = join(BINARY_DIR, target.targetName);
  if (existsSync(binaryPath)) {
    // Already downloaded
    return;
  }

  const releaseUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${VERSION}/${target.artifact}.tar.gz`;

  console.log(`CODEXA: Downloading binary for ${os.platform()}/${os.arch()} (v${VERSION})...`);
  console.log(`        From: ${releaseUrl}`);

  mkdirSync(BINARY_DIR, { recursive: true });
  const tarPath = join(BINARY_DIR, "codexa.tar.gz");

  try {
    await download(releaseUrl, tarPath);

    // Extract binary from tarball
    execFileSync("tar", ["-xzf", tarPath, "-C", BINARY_DIR], { stdio: "pipe" });

    // Rename to platform-specific name
    const { renameSync } = require("node:fs");
    const extractedPath = join(BINARY_DIR, target.filename);
    if (existsSync(extractedPath)) {
      renameSync(extractedPath, binaryPath);
      if (os.platform() !== "win32") {
        chmodSync(binaryPath, 0o755);
      }
    }

    // Cleanup tarball
    const { unlinkSync } = require("node:fs");
    try { unlinkSync(tarPath); } catch {}

    console.log(`CODEXA: Binary installed successfully ✓`);
  } catch (err) {
    // Non-fatal: user can still use via Bun
    console.log(`CODEXA: Could not download binary: ${err.message}`);
    console.log("CODEXA: Install Bun (https://bun.sh) to run from source, or download manually from:");
    console.log(`        https://github.com/${GITHUB_REPO}/releases/tag/v${VERSION}`);

    // Clean up partial downloads
    try { require("node:fs").unlinkSync(tarPath); } catch {}
  }
}

main().catch((err) => {
  console.error("CODEXA postinstall error:", err.message);
  // Never fail the overall install
  process.exit(0);
});
