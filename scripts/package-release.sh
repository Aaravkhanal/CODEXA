#!/usr/bin/env bash
set -euo pipefail

version="${1:?Usage: scripts/package-release.sh <version>}"
release_dir="release"

rm -rf "$release_dir"
mkdir -p "$release_dir"

for target in darwin-arm64 darwin-x64 linux-arm64 linux-x64 linux-arm64-musl linux-x64-musl; do
  archive="codexa-v${version}-${target}.tar.gz"
  tar -C "artifacts/${target}" -czf "${release_dir}/${archive}" codexa
done

for target in windows-arm64 windows-x64; do
  archive="codexa-v${version}-${target}.zip"
  (cd "artifacts/${target}" && zip -q "../../${release_dir}/${archive}" codexa.exe)
done

(cd "$release_dir" && sha256sum codexa-* > SHA256SUMS)
