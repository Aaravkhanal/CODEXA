import { readFileSync, writeFileSync, globSync } from "node:fs";
import { join } from "node:path";

const files = globSync("node_modules/**/chunk-rm53pqj2.js");

for (const file of files) {
  try {
    let content = readFileSync(file, "utf-8");
    let modified = false;

    if (content.includes('throw new Error("Text must be created inside of a text node");')) {
      content = content.replace(
        `if (!hostContext.isInsideText) {\n      throw new Error("Text must be created inside of a text node");\n    }`,
        ""
      );
      content = content.replace(
        `if (!hostContext.isInsideText) {\n      throw new Error("Text must be created inside of a text node");\n    }`,
        ""
      );
      modified = true;
    }

    if (content.includes('must be created inside of a text node')) {
      content = content.replace(
        `if (textNodeKeys.includes(type) && !hostContext.isInsideText) {\n      throw new Error(\`Component of type "\${type}" must be created inside of a text node\`);\n    }`,
        ""
      );
      modified = true;
    }

    if (modified) {
      writeFileSync(file, content, "utf-8");
      console.log(`[patch-opentui] Patched ${file}`);
    }
  } catch (err: any) {
    console.warn(`[patch-opentui] Warning patching ${file}:`, err.message);
  }
}
