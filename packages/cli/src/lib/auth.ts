import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getCodexaDir } from "./global-config";

type AuthData = {
  token: string;
};

function authDir(): string {
  return getCodexaDir();
}

function authFile(): string {
  return join(authDir(), "auth.json");
}

export function getAuth(): AuthData | null {
  try {
    const data = readFileSync(authFile(), "utf-8");
    const parsed = JSON.parse(data) as Partial<AuthData>;

    return typeof parsed.token === "string"
      ? { token: parsed.token }
      : null;
  } catch {
    return null;
  }
}

export function saveAuth(data: AuthData): void {
  const directory = authDir();
  if (!existsSync(directory)) {
    // Keep locally stored credentials private to the current OS user.
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }

  writeFileSync(authFile(), JSON.stringify(data), { mode: 0o600 });
}

export function clearAuth(): void {
  try {
    unlinkSync(authFile());
  } catch {
    // The auth file may not exist yet.
  }
}
