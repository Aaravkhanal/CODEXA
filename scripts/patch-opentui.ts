import { readFileSync, writeFileSync, globSync } from "node:fs";

const files = globSync("node_modules/**/chunk-rm53pqj2.js");

for (const file of files) {
  try {
    let content = readFileSync(file, "utf-8");
    let modified = false;

    // 1. Remove strict text node throw in createTextInstance
    if (content.includes('throw new Error("Text must be created inside of a text node");')) {
      content = content.replace(
        /if\s*\(!hostContext\.isInsideText\)\s*\{\s*throw\s+new\s+Error\("Text must be created inside of a text node"\);\s*\}/g,
        ""
      );
      modified = true;
    }

    // 2. Remove strict textNodeKeys throw in createInstance
    if (content.includes('must be created inside of a text node')) {
      content = content.replace(
        /if\s*\(textNodeKeys\.includes\(type\)\s*&&\s*!hostContext\.isInsideText\)\s*\{\s*throw\s+new\s+Error\([^)]+\);\s*\}/g,
        ""
      );
      modified = true;
    }

    // 3. Fallback unknown component types to TextRenderable / BoxRenderable instead of throwing
    if (content.includes('throw new Error(`Unknown component type: ${type}`);')) {
      content = content.replace(
        `if (!components[type]) {\n      throw new Error(\`Unknown component type: \${type}\`);\n    }\n    return new components[type](rootContainerInstance.ctx, {\n      id,\n      ...props\n    });`,
        `const ComponentClass = components[type] || (hostContext?.isInsideText ? SpanRenderable : BoxRenderable);\n    return new ComponentClass(rootContainerInstance.ctx, {\n      id,\n      ...props\n    });`
      );
      modified = true;
    }

    // 4. Register HTML & Markdown tags in baseComponents mapped to top-level Renderable components
    if (content.includes('a: LinkRenderable') && !content.includes('h2: TextRenderable')) {
      content = content.replace(
        /a:\s*LinkRenderable,[\s\S]*?\};/m,
        `a: LinkRenderable,\n  h1: TextRenderable,\n  h2: TextRenderable,\n  h3: TextRenderable,\n  h4: TextRenderable,\n  h5: TextRenderable,\n  h6: TextRenderable,\n  p: TextRenderable,\n  div: BoxRenderable,\n  li: TextRenderable,\n  ul: BoxRenderable,\n  ol: BoxRenderable,\n  pre: CodeRenderable,\n  blockquote: TextRenderable,\n  hr: BoxRenderable,\n  table: BoxRenderable,\n  thead: BoxRenderable,\n  tbody: BoxRenderable,\n  tr: BoxRenderable,\n  th: TextRenderable,\n  td: TextRenderable\n};`
      );
      modified = true;
    }

    if (modified) {
      writeFileSync(file, content, "utf-8");
      console.log(`[patch-opentui] Patched ${file} successfully.`);
    }
  } catch (err: any) {
    console.warn(`[patch-opentui] Warning patching ${file}:`, err.message);
  }
}
