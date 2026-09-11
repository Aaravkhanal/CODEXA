import { readFileSync, writeFileSync, globSync } from "node:fs";

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}

// ── Collect all @opentui/react reconciler chunks (any nested node_modules) ──
const reactFiles = dedupe([
  ...globSync("node_modules/**/@opentui/react/chunk-rm53pqj2.js"),
  ...globSync("packages/*/node_modules/@opentui/react/chunk-rm53pqj2.js"),
]);

// ── Collect all @opentui/core JS files (any nested node_modules) ──
const coreFiles = dedupe([
  ...globSync("node_modules/@opentui/core/*.js"),
  ...globSync("node_modules/@opentui/core/**/*.js"),
  ...globSync("packages/*/node_modules/@opentui/core/*.js"),
  ...globSync("packages/*/node_modules/@opentui/core/**/*.js"),
]);

// ──────────────────────────────────────────────────────────────────────────────
// 1. Patch @opentui/react reconciler
// ──────────────────────────────────────────────────────────────────────────────
for (const file of reactFiles) {
  try {
    let content = readFileSync(file, "utf-8");
    let modified = false;

    // Remove strict text node throw in createTextInstance
    if (content.includes('throw new Error("Text must be created inside of a text node");')) {
      content = content.replace(
        /if\s*\(!hostContext\.isInsideText\)\s*\{\s*throw\s+new\s+Error\("Text must be created inside of a text node"\);\s*\}/g,
        ""
      );
      modified = true;
    }

    // Remove strict textNodeKeys throw in createInstance
    if (content.includes('must be created inside of a text node')) {
      content = content.replace(
        /if\s*\(textNodeKeys\.includes\(type\)\s*&&\s*!hostContext\.isInsideText\)\s*\{\s*throw\s+new\s+Error\([^)]+\);\s*\}/g,
        ""
      );
      modified = true;
    }

    // Robust createInstance with getLayoutNode fallback and textNodeKeys handling
    if (!content.includes('typeof instance.getLayoutNode !== "function"')) {
      content = content.replace(
        /createInstance\(type,\s*props,\s*rootContainerInstance,\s*hostContext\)\s*\{[\s\S]*?return new (?:components\[type\]|ComponentClass)\([\s\S]*?\};\s*\}/,
        `createInstance(type, props, rootContainerInstance, hostContext) {
    const id = getNextId(type);
    const components = getComponentCatalogue();
    let ComponentClass = components[type];
    if (!ComponentClass) {
      ComponentClass = hostContext?.isInsideText ? SpanRenderable : BoxRenderable;
    } else if (!hostContext?.isInsideText && textNodeKeys.includes(type)) {
      ComponentClass = TextRenderable;
    }
    const instance = new ComponentClass(rootContainerInstance.ctx, {
      id,
      ...props
    });
    if (typeof instance.getLayoutNode !== "function") {
      instance.getLayoutNode = function() {
        return instance.layoutNode || (rootContainerInstance.ctx && typeof rootContainerInstance.ctx.createNode === "function" ? rootContainerInstance.ctx.createNode() : null);
      };
    }
    return instance;
  }`
      );
      modified = true;
    }

    // Register HTML & Markdown tags in baseComponents
    if (content.includes('a: LinkRenderable') && !content.includes('h2: TextRenderable')) {
      content = content.replace(
        /a:\s*LinkRenderable,[\s\S]*?\};/m,
        `a: LinkRenderable,\n  h1: TextRenderable,\n  h2: TextRenderable,\n  h3: TextRenderable,\n  h4: TextRenderable,\n  h5: TextRenderable,\n  h6: TextRenderable,\n  p: TextRenderable,\n  div: BoxRenderable,\n  li: TextRenderable,\n  ul: BoxRenderable,\n  ol: BoxRenderable,\n  pre: CodeRenderable,\n  blockquote: TextRenderable,\n  hr: BoxRenderable,\n  table: BoxRenderable,\n  thead: BoxRenderable,\n  tbody: BoxRenderable,\n  tr: BoxRenderable,\n  th: TextRenderable,\n  td: TextRenderable\n};`
      );
      modified = true;
    }

    if (modified) {
      writeFileSync(file, content, "utf-8");
      console.log(`[patch-opentui] Patched @opentui/react in ${file}`);
    } else {
      console.log(`[patch-opentui] @opentui/react already patched: ${file}`);
    }
  } catch (err: any) {
    console.warn(`[patch-opentui] Warning patching ${file}:`, err.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Patch @opentui/core — make all renderable.getLayoutNode() calls null-safe
// ──────────────────────────────────────────────────────────────────────────────
for (const file of coreFiles) {
  try {
    let content = readFileSync(file, "utf-8");
    let modified = false;

    // Replace renderable.getLayoutNode() calls with safe null-checked accessors
    // Guard: check that a raw call exists and the safe wrapper is NOT already there
    if (content.includes('renderable.getLayoutNode()') && !content.includes('typeof renderable.getLayoutNode === "function" ? renderable.getLayoutNode()')) {
      content = content.replace(
        /renderable\.getLayoutNode\(\)/g,
        `(typeof renderable.getLayoutNode === "function" ? renderable.getLayoutNode() : (renderable.yogaNode || null))`
      );
      modified = true;
    }

    if (content.includes('anchor.getLayoutNode()') && !content.includes('typeof anchor.getLayoutNode === "function" ? anchor.getLayoutNode()')) {
      content = content.replace(
        /anchor\.getLayoutNode\(\)/g,
        `(typeof anchor.getLayoutNode === "function" ? anchor.getLayoutNode() : (anchor.yogaNode || null))`
      );
      modified = true;
    }

    if (modified) {
      writeFileSync(file, content, "utf-8");
      console.log(`[patch-opentui] Patched @opentui/core in ${file}`);
    }
  } catch (err: any) {
    console.warn(`[patch-opentui] Warning patching ${file}:`, err.message);
  }
}
