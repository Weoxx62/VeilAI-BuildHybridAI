import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@veilai/hybrid-core": path.resolve(
        import.meta.dirname,
        "../../packages/hybrid-core/src/index.ts",
      ),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "firebase-vendor",
              test: /node_modules[\\/](firebase|@firebase)[\\/]/,
              priority: 20,
            },
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|lucide-react)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
});
