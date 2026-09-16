import { useState } from "react";
import { AnimatedSectionHeading, Icon, writeClipboard } from "./Shared";

const providers = [
  { name: "Anthropic", models: "Claude Opus, Sonnet, Haiku", setup: "API key", fit: "Complex implementation and review" },
  { name: "OpenAI", models: "GPT-5.4, GPT-4o", setup: "API key", fit: "General coding and tool use" },
  { name: "Google", models: "Gemini 2.5 Pro, Flash", setup: "API key", fit: "Long-context analysis" },
  { name: "Groq", models: "Llama 3.3, Qwen", setup: "API key", fit: "Fast, lower-cost iterations" },
  { name: "Ollama", models: "Installed local models", setup: "Local server", fit: "Private, offline-capable work" },
  { name: "OpenRouter", models: "Provider catalogue", setup: "API key", fit: "One key for multiple providers" },
] as const;

const examples = [
  {
    name: "React app",
    description: "Start a typed frontend, then ask CODEXA to add a feature and tests.",
    command: "npm create vite@latest my-app -- --template react-ts && cd my-app && codexa",
  },
  {
    name: "Next.js app",
    description: "Create a full-stack application and let CODEXA inspect the repository.",
    command: "npx create-next-app@latest my-app && cd my-app && codexa",
  },
  {
    name: "Existing repository",
    description: "Use CODEXA in any project; it never requires the project to use Bun.",
    command: "cd path/to/your-project && codexa",
  },
] as const;

function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await writeClipboard(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button className="adoption-copy" type="button" onClick={copy} aria-label={copied ? "Copied command" : "Copy command"}>
      <Icon name={copied ? "check" : "copy"} size={14} />
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function Adoption() {
  return (
    <>
      <section className="demo section-shell" id="demo" aria-labelledby="demo-heading">
        <div className="demo-copy">
          <p className="eyebrow">ONE-MINUTE WALKTHROUGH</p>
          <AnimatedSectionHeading id="demo-heading">From install to a verified change.</AnimatedSectionHeading>
          <p>
            Install once, enter any repository, configure a provider, review the plan, and approve only the edits you want.
            The interactive terminal above and this guided sequence show the complete first-use path in under a minute.
          </p>
        </div>
        <ol className="demo-steps">
          <li><span>01</span><strong>Install</strong><p>Use npm, a release binary, Homebrew, or the Windows installer.</p></li>
          <li><span>02</span><strong>Open a project</strong><p>Run <code>codexa</code> from the repository you want help with.</p></li>
          <li><span>03</span><strong>Choose a provider</strong><p>Add one key or configure several and pick the right model per task.</p></li>
          <li><span>04</span><strong>Plan, approve, verify</strong><p>Review a read-only plan, approve implementation, then inspect checks and token usage.</p></li>
        </ol>
      </section>

      <section className="compatibility section-shell" id="compatibility" aria-labelledby="compatibility-heading">
        <div className="compatibility-header">
          <p className="eyebrow">BRING YOUR OWN PROVIDER</p>
          <AnimatedSectionHeading id="compatibility-heading">Pick the model that fits the work.</AnimatedSectionHeading>
          <p>CODEXA keeps keys on your machine. With one configured provider it uses that provider; with several, it recommends a model and lets you choose.</p>
        </div>
        <div className="compatibility-table-wrapper">
          <table className="compatibility-table">
            <thead><tr><th>Provider</th><th>Models</th><th>Setup</th><th>Best for</th></tr></thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.name}>
                  <td><strong>{provider.name}</strong></td><td>{provider.models}</td><td>{provider.setup}</td><td>{provider.fit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="examples section-shell" id="examples" aria-labelledby="examples-heading">
        <div className="examples-header">
          <p className="eyebrow">WORKS IN ANY REPOSITORY</p>
          <AnimatedSectionHeading id="examples-heading">Copy, paste, build.</AnimatedSectionHeading>
        </div>
        <div className="example-grid">
          {examples.map((example) => (
            <article className="example-card" key={example.name}>
              <h3>{example.name}</h3>
              <p>{example.description}</p>
              <div className="example-command"><code>{example.command}</code><CopyCommand command={example.command} /></div>
            </article>
          ))}
        </div>
        <p className="examples-more">More guided scenarios and prompt ideas are available in the <a href="https://github.com/Aaravkhanal/CODEXA/tree/main/examples" target="_blank" rel="noreferrer">examples guide</a>.</p>
      </section>
    </>
  );
}
