# Hardened Docker Sandbox Model

CODEXA provides an opt-in, hardened Docker container sandbox for executing shell commands (`bash` tool) during BUILD mode when launched with `--sandbox` or `CODEXA_SANDBOX=true`.

---

## Security Boundary & Isolation

When sandbox execution is active, CODEXA spawns host commands inside an isolated Docker container (`oven/bun:1.3.13-alpine`).

### 1. Network Isolation by Default
- **Default Policy**: Network egress is completely disabled inside the container (`--network none`).
- **Egress Configuration**: If a task genuinely requires outbound network connectivity (e.g. installing npm/pip dependencies), network access can be configured via `.codexa/config.json` or environment variables:
  ```jsonc
  // .codexa/config.json
  {
    "sandbox": {
      "network": "bridge" // Options: "none" (default), "bridge", "host"
    }
  }
  ```
  Or via environment variable:
  ```sh
  CODEXA_SANDBOX_NETWORK=bridge codexa --sandbox
  ```

### 2. Resource Limits & Hard Caps
Containers are bounded by default resource caps to prevent fork-bombs, memory exhaustion, or high CPU consumption:
- **CPU Allocation**: Default `2` CPUs (`--cpus 2`). Override with `sandbox.cpus` or `CODEXA_SANDBOX_CPUS`.
- **Memory Cap**: Default `2GB` (`--memory 2g`). Override with `sandbox.memory` or `CODEXA_SANDBOX_MEMORY`.

### 3. Rootless Container Execution
- Containers run with the host caller's UID and GID (`--user uid:gid` on POSIX systems).
- Files written inside `/workspace` inherit the current user's file ownership without root pollution on the host filesystem.

---

## Status Visibility

Every sandboxed command output returns a detailed status line surfacing the active security boundary:

```text
[Sandboxed Execution: docker (network: none | CPUs: 2 | Memory: 2g | User: 1000:1000)]
```

Direct host execution explicitly reports:

```text
[Host Execution: direct]
```

---

## Known Limitations & Security Model Scope

1. **Volume Mounting**: The current working directory is mounted into `/workspace` so the agent can modify project files and run build tools. Files within the project directory remain writeable by the container.
2. **Docker Socket / Privileged Access**: CODEXA does not mount the host Docker socket (`/var/run/docker.sock`) into the sandbox container. Container breakout via socket access is prevented.
3. **Daemon Privileges**: If the host Docker daemon is running as root without rootless Docker enabled, container isolation relies on Linux kernel namespaces, cgroups, and capabilities restrictions (`--rm`).
