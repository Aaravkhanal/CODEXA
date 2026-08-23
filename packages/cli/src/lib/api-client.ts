import { hc } from "hono/client";
import type { AppType } from "@codexa/server";
import { clearAuth, getAuth } from "./auth";
import { getApiUrl } from "./config";
import { getAllApiKeys } from "./api-keys";

export const apiClient = hc<AppType>(
  getApiUrl(),
  {
    fetch: async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const headers = new Headers(init?.headers);
      const auth = getAuth();

      if (auth) {
        headers.set("Authorization", `Bearer ${auth.token}`);
      }

      // Attach locally stored provider API keys as headers
      const storedKeys = getAllApiKeys();
      if (storedKeys.anthropic) {
        headers.set("X-Anthropic-Key", storedKeys.anthropic);
      }
      if (storedKeys.openai) {
        headers.set("X-OpenAI-Key", storedKeys.openai);
      }

      const response = await fetch(input, { ...init, headers });
      if (response.status === 401) {
        clearAuth();
      }

      return response;
    },
  },
);
