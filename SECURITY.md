# Security Policy

CODEXA handles local source code, authentication tokens, AI-provider requests,
billing state, and optional MCP tools. Please report suspected vulnerabilities
privately so users can be protected before details are published.

## Supported versions

Security fixes are provided for the latest published release and the current
`main` branch. Upgrade to the newest release before reporting a problem that may
already have been fixed.

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/Aaravkhanal/CODEXA/security/advisories/new).
Do not open a public issue for an unpatched vulnerability.

Include, when applicable:

- The affected CODEXA version, operating system, and installation method.
- A minimal reproduction or proof of concept.
- The expected and observed security boundaries.
- Potential impact, including whether credentials or local files are exposed.
- Any suggested mitigation, without including real secrets or user data.

The maintainers aim to acknowledge reports within 72 hours and provide a status
update within seven days. Timelines for a fix and disclosure depend on severity
and release complexity.

## Scope

Reports involving path traversal, unsafe file access, authentication bypass, credential disclosure, billing manipulation, installer integrity, dependency compromise, or MCP permission bypass are especially valuable. Findings against third-party services should be reported to the relevant provider unless CODEXA is the source of the vulnerability.

Please allow a reasonable remediation period before public disclosure.

---

## Secret & Key Storage Guidelines

### 1. Storage Location
For the CLI tool, user API keys and configurations are saved locally on the user's filesystem inside the home directory:
- **Location**: `~/.codexa/api-keys.json`
- **Contents**: Raw model keys, custom MCP configurations, and local access tokens.

### 2. Filesystem Permissions
To protect against local privilege escalation or multi-user access leaks, we recommend hardening files inside the `~/.codexa/` folder. Ensure permissions are restricted to the owner only:

On Unix-like platforms (macOS/Linux):
```sh
# Restrict read/write/execute permissions to current user only
chmod 700 ~/.codexa
chmod 600 ~/.codexa/api-keys.json
```

On Windows (PowerShell):
```powershell
# Disable inheritance and restrict ACLs to the current user
icacls "$env:USERPROFILE\.codexa" /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)(F)"
```

### 3. Secret Rotation Guidance
In case of suspected key compromises:
1. Revoke the API key immediately at the provider dashboard (Anthropic, OpenAI, Clerk, Polar).
2. Edit or delete the matching entry in `~/.codexa/api-keys.json`.
3. If database credentials are leaked, regenerate the connection string password and update `DATABASE_URL` in your server deployment config or local `.env` file.
4. Ensure your local configuration files are never committed to your Git repository (verify your global or local `.gitignore` prevents staging files under `~/.codexa` or `.env`).

