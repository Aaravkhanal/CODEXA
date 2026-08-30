import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { getApiKey, setApiKey, removeApiKey, getAllApiKeys, hasApiKey } from "./api-keys";

describe("API Keys Storage", () => {
  const testProvider = "test_provider_unit_test";
  const testKey = "sk-test-123456789";

  beforeEach(() => {
    removeApiKey(testProvider);
  });

  afterEach(() => {
    removeApiKey(testProvider);
  });

  test("returns false and null when key is not set", () => {
    expect(hasApiKey(testProvider)).toBe(false);
    expect(getApiKey(testProvider)).toBeNull();
  });

  test("saves and retrieves API key", () => {
    setApiKey(testProvider, testKey);
    expect(hasApiKey(testProvider)).toBe(true);
    expect(getApiKey(testProvider)).toBe(testKey);

    const allKeys = getAllApiKeys();
    expect(allKeys[testProvider]).toBe(testKey);
  });

  test("removes API key successfully", () => {
    setApiKey(testProvider, testKey);
    expect(hasApiKey(testProvider)).toBe(true);
    removeApiKey(testProvider);
    expect(hasApiKey(testProvider)).toBe(false);
    expect(getApiKey(testProvider)).toBeNull();
  });
});
