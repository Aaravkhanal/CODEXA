import type { LanguageModel } from "ai";

export interface MockModelOptions {
  modelId?: string;
  responseGenerator?: (prompt: string) => {
    text?: string;
    toolCalls?: Array<{
      toolCallType: "function";
      toolCallId: string;
      toolName: string;
      args: string;
    }>;
  };
}

export class MockLanguageModel {
  readonly specificationVersion = "v2" as const;
  readonly defaultObjectGenerationMode = "json" as const;
  readonly provider = "mock";
  readonly modelId: string;
  readonly supportedUrls: string[] = [];
  private readonly responseGenerator?: MockModelOptions["responseGenerator"];

  constructor(options: MockModelOptions = {}) {
    this.modelId = options.modelId ?? "mock-coding-model";
    this.responseGenerator = options.responseGenerator;
  }

  async doGenerate(options: any): Promise<any> {
    const promptText = (options.prompt || [])
      .map((msg: any) => {
        if (typeof msg.content === "string") return msg.content;
        if (Array.isArray(msg.content)) {
          return msg.content
            .map((c: any) => ("text" in c ? c.text : JSON.stringify(c)))
            .join("\n");
        }
        return JSON.stringify(msg.content);
      })
      .join("\n\n");

    let text = "Mock response from CodeXA agent: Analysis complete. All tasks verified.";
    let toolCalls: any[] | undefined = undefined;

    if (this.responseGenerator) {
      const custom = this.responseGenerator(promptText);
      if (custom.text !== undefined) text = custom.text;
      if (custom.toolCalls) toolCalls = custom.toolCalls;
    } else if (promptText.includes("Reply with exactly: ok")) {
      text = "ok";
    }

    const content: any[] = [];
    if (text) {
      content.push({ type: "text", text });
    }
    if (toolCalls) {
      for (const tc of toolCalls) {
        content.push({
          type: "tool-call",
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.args,
        });
      }
    }

    return {
      content,
      finishReason: toolCalls && toolCalls.length > 0 ? "tool-calls" : "stop",
      usage: {
        promptTokens: Math.ceil(promptText.length / 4) || 1,
        completionTokens: Math.ceil(text.length / 4) || 1,
      },
      rawCall: { rawPrompt: promptText, rawSettings: {} },
    };
  }

  async doStream(options: any): Promise<any> {
    const gen = await this.doGenerate(options);
    const text = gen.content.find((c: any) => c.type === "text")?.text ?? "";

    const stream = new ReadableStream<any>({
      start(controller) {
        if (text) {
          controller.enqueue({ type: "text-delta", delta: text });
        }
        for (const part of gen.content) {
          if (part.type === "tool-call") {
            controller.enqueue(part);
          }
        }
        controller.enqueue({
          type: "finish",
          finishReason: gen.finishReason,
          usage: gen.usage,
        });
        controller.close();
      },
    });

    return {
      stream,
      rawCall: gen.rawCall,
    };
  }
}

export function createMockModel(options: MockModelOptions = {}): LanguageModel {
  return new MockLanguageModel(options) as unknown as LanguageModel;
}


