/// <reference types="@rsbuild/core/types" />

interface WebpackContextOptions {
  recursive?: boolean;
  regExp?: RegExp;
  mode?: "sync" | "eager" | "weak" | "lazy" | "lazy-once";
}

interface WebpackContext {
  keys(): string[];
  (id: string): any;
  resolve(id: string): string | number;
}

interface ImportMeta {
  webpackContext(
    directory: string,
    options?: WebpackContextOptions
  ): WebpackContext;
}
