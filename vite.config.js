import { defineConfig } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function offlineShell() {
  let output;
  return {
    name: "offline-shell",
    apply: "build",
    configResolved(config) { output = resolve(config.root, config.build.outDir); },
    closeBundle() {
      const files = readdirSync(output, { recursive: true }).filter((file) => /\.(html|js|css|json|webmanifest|svg|png|webp|woff2)$/.test(file) && file !== "sw.js");
      const hash = createHash("sha256");
      for (const file of files.sort()) hash.update(readFileSync(resolve(output, file)));
      const worker = readFileSync(resolve(output, "sw.js"), "utf8")
        .replace("__BUILD_VERSION__", hash.digest("hex").slice(0, 16))
        .replace("const PRECACHE = [];", `const PRECACHE = ${JSON.stringify(files.map((file) => `./${file}`))};`);
      writeFileSync(resolve(output, "sw.js"), worker);
    },
  };
}

// Relative assets work at both /deadlock-stats/ and the future custom domain.
export default defineConfig({ base: "./", plugins: [offlineShell()] });
