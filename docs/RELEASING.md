# Releasing CODEXA

CODEXA releases consist of a Railway API deployment and standalone CLI binaries
published through GitHub Releases. The CLI embeds no credentials and uses the
production Railway API by default.

## One-time repository configuration

1. Protect `main` and require the `CI / validate` check.
2. Create the `codexa/homebrew-tap` public repository with a `Formula`
   directory and a protected `main` branch.
3. Add this Actions variable to the CODEXA repository:
   - `HOMEBREW_TAP_REPOSITORY=codexa/homebrew-tap`
4. Add `HOMEBREW_TAP_TOKEN` as an Actions secret. Use a fine-grained token or
   GitHub App token restricted to the tap repository with Contents and Pull
   requests write access.
5. Ensure Railway defines `CLERK_FRONTEND_API` and `CLERK_OAUTH_CLIENT_ID`; the
   public `/auth/config` endpoint supplies these public OAuth identifiers to the
   installed CLI.

Do not place database URLs, Clerk secret keys, provider API keys, billing keys,
or other credentials in GitHub variables used by the binary build.

## Creating a release

1. Merge the release changes into `main`.
2. Update `packages/cli/package.json` to the intended semantic version.
3. Confirm Railway is deployed and healthy.
4. Run the CI workflow successfully on `main`.
5. Create and push a matching tag:

   ```sh
   git tag -a v0.1.0 -m "CODEXA v0.1.0"
   git push origin v0.1.0
   ```

The tag must match the CLI version. Tags with a prerelease suffix, such as
`v0.1.0-beta.1`, are published as GitHub prereleases.

The release workflow validates the project, builds eight platform targets,
creates archives and checksums, generates GitHub provenance attestations, and
publishes the GitHub Release. If Homebrew is configured, it then tests the new
formula and opens an update PR in the tap repository.

## Verifying release assets

```sh
gh release download v0.1.0
shasum -a 256 -c SHA256SUMS
gh attestation verify codexa-v0.1.0-darwin-arm64.tar.gz \
  --repo codexa/codexa
```

Before promoting the first stable release, test the TUI, login, chat, local
tools, billing flow, and CodexaLens on clean macOS, Linux, and Windows machines.
Alpine/musl verification installs the required `libstdc++` and `libgcc` runtime
packages before launching the binary.

## Homebrew

Users install the formula directly from the tap:

```sh
brew install codexa/tap/codexa
```

After the automated formula PR is reviewed and merged, `brew update` and
`brew upgrade codexa` deliver the new version.

## Code signing & Notarization

GitHub checksums and attestations are enabled by default. To prevent operating-system security warnings (macOS Gatekeeper and Windows Defender SmartScreen), release binaries can be automatically signed and notarized in GitHub Actions.

### macOS Code-Signing & Notarization Setup

#### Required GitHub Secrets Checklist:
1. `APPLE_CERTIFICATE_BASE64`: Base64-encoded P12 file containing your Apple Developer ID Application Certificate.
2. `APPLE_CERTIFICATE_PASSWORD`: Password for the P12 certificate.
3. `APPLE_KEYCHAIN_PASSWORD`: Temporary password generated for the CI keychain.
4. `APPLE_ID`: Your Apple Developer Account email address.
5. `APPLE_TEAM_ID`: Your 10-character Apple Developer Team ID.
6. `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password generated at [appleid.apple.com](https://appleid.apple.com).

#### macOS CI Steps (`.github/workflows/release.yml`):
```yaml
- name: Import Apple Certificate
  run: |
    echo "$APPLE_CERTIFICATE_BASE64" | base64 --decode > certificate.p12
    security create-keychain -p "$APPLE_KEYCHAIN_PASSWORD" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "$APPLE_KEYCHAIN_PASSWORD" build.keychain
    security import certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$APPLE_KEYCHAIN_PASSWORD" build.keychain

- name: Sign macOS Binary
  run: |
    codesign --deep --force --options runtime --sign "Developer ID Application: Your Team Name ($APPLE_TEAM_ID)" artifacts/darwin-x64/codexa
    codesign --deep --force --options runtime --sign "Developer ID Application: Your Team Name ($APPLE_TEAM_ID)" artifacts/darwin-arm64/codexa

- name: Notarize and Staple Binary
  run: |
    xcrun notarytool submit artifacts/darwin-arm64/codexa.tar.gz \
      --apple-id "$APPLE_ID" \
      --team-id "$APPLE_TEAM_ID" \
      --password "$APPLE_APP_SPECIFIC_PASSWORD" \
      --wait
```

---

### Windows Authenticode Signing Setup

#### Required GitHub Secrets Checklist:
1. `WINDOWS_CERTIFICATE_BASE64`: Base64-encoded PFX/P12 Code Signing Certificate (EV or OV).
2. `WINDOWS_CERT_PASSWORD`: Password for the Windows certificate.

#### Windows CI Steps (`.github/workflows/release.yml`):
```yaml
- name: Sign Windows Binary
  shell: pwsh
  run: |
    $certPath = "$env:TEMP\cert.pfx"
    [IO.File]::WriteAllBytes($certPath, [Convert]::FromBase64String($env:WINDOWS_CERTIFICATE_BASE64))
    signtool sign /f $certPath /p $env:WINDOWS_CERT_PASSWORD /tr http://timestamp.digicert.com /td sha256 /fd sha256 artifacts/windows-x64/codexa.exe
    Remove-Item $certPath
```
