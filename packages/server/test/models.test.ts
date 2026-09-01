import { describe, expect, it } from "bun:test";
import { isSupportedChatModel, resolveChatModel } from "../src/lib/models";

describe("Language Model Resolution", () => {
  it("validates supported model identifiers", () => {
    expect(isSupportedChatModel("claude-3-5-sonnet")).toBe(true);
    expect(isSupportedChatModel("gpt-4o")).toBe(true);
    expect(isSupportedChatModel("invalid-model-id")).toBe(false);
  });

  it("resolves Anthropic model configuration with client API keys", () => {
    const resolved = resolveChatModel("claude-3-5-sonnet", {
      anthropic: "sk-ant-test-key",
    });
    expect(resolved.provider).toBe("anthropic");
    expect(resolved.modelId).toBe("claude-3-5-sonnet");
    expect(resolved.model).toBeDefined();
  });

  it("resolves OpenAI model configuration with client API keys", () => {
    const resolved = resolveChatModel("gpt-4o", {
      openai: "sk-proj-test-key",
    });
    expect(resolved.provider).toBe("openai");
    expect(resolved.modelId).toBe("gpt-4o");
    expect(resolved.model).toBeDefined();
  });

  it("throws error when resolving an unsupported model", () => {
    expect(() => resolveChatModel("unknown-model-xyz")).toThrow("Unsupported model: unknown-model-xyz");
  });
});
