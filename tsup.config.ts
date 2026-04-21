import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/react/index.ts", "src/next/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  target: "node20",
  sourcemap: true,
  clean: true,
  splitting: false,
  outDir: "dist",
  external: ["ai", /^@ai-sdk\//, "react", "react-dom"],
})
