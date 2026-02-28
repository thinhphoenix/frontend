/// <reference types="@rsbuild/core/types" />

declare module "virtual-fs-routes" {
  export const routePrefix: string;
  export const pages: Record<string, () => Promise<{ default: React.ComponentType<any> }>>;
  export const layouts: Record<string, () => Promise<{ default: React.ComponentType<{ children: React.ReactNode }> }>>;
  export const notFounds: Record<string, () => Promise<{ default: React.ComponentType<any> }>>;
  export const loadings: Record<string, () => Promise<{ default: React.ComponentType<any> }>>;
  export const errors: Record<string, () => Promise<{ default: React.ComponentType<{ error: Error; reset: () => void }> }>>;
}
