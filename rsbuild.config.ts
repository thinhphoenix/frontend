import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginFsRouter } from "./plugins/fs-router/plugin";

export default defineConfig({
  plugins: [pluginReact(), pluginFsRouter({ appDir: "src/routes" })],
  source: {
    entry: {
      index: "./src/main.tsx",
    },
  },
  resolve: {
    alias: {
      "@": "./src",
    },
  },
  html: {
    template: "./index.html",
  },
  server: {
    base: "/frontend",
    historyApiFallback: true,
  },
});
