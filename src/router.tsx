import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  Suspense,
  lazy,
  type ComponentType,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteParams = Record<string, string>;

type RouterContextValue = {
  pathname: string;
  params: RouteParams;
  navigate: (to: string) => void;
};

type RouteEntry = {
  pattern: RegExp;
  paramNames: string[];
  page: () => Promise<{ default: ComponentType<unknown> }>;
  layouts: (() => Promise<{
    default: ComponentType<{ children: React.ReactNode }>;
  }>)[];
};

// ---------------------------------------------------------------------------
// Base path — reads from Rsbuild's server.base via import.meta.env.BASE_URL
// ---------------------------------------------------------------------------

// BASE_URL includes trailing slash (e.g. "/frontend/"), strip it for prefix matching
const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/+$/, "") || "";

/** Strip the base prefix from a browser pathname to get the route path. */
function stripBase(browserPath: string): string {
  if (BASE && browserPath.startsWith(BASE)) {
    const rest = browserPath.slice(BASE.length);
    return rest.startsWith("/") ? rest : "/" + rest;
  }
  return browserPath;
}

/** Prepend the base prefix to a route path for use in the browser URL. */
function withBase(routePath: string): string {
  if (!BASE) return routePath;
  return BASE + (routePath.startsWith("/") ? routePath : "/" + routePath);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RouterContext = createContext<RouterContextValue>({
  pathname: "/",
  params: {},
  navigate: () => {},
});

export function useRouter() {
  return useContext(RouterContext);
}

export function useParams(): RouteParams {
  return useContext(RouterContext).params;
}

// ---------------------------------------------------------------------------
// Link
// ---------------------------------------------------------------------------

export function Link({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const { navigate } = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      e.shiftKey ||
      e.defaultPrevented
    )
      return;
    e.preventDefault();
    navigate(href);
  };

  // href from user is a route path like "/about", add base for the actual <a>
  const fullHref = withBase(href);

  return (
    <a href={fullHref} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Build routes from import.meta.webpackContext
// ---------------------------------------------------------------------------

// Use Rspack's import.meta.webpackContext to discover page and layout files
const pageContext = import.meta.webpackContext("../app", {
  recursive: true,
  regExp: /\/page\.tsx$/,
  mode: "lazy",
});

const layoutContext = import.meta.webpackContext("../app", {
  recursive: true,
  regExp: /\/layout\.tsx$/,
  mode: "lazy",
});

// Build lookup maps: normalized key -> loader
type ModuleLoader<T> = () => Promise<{ default: T }>;

function buildModuleMap<T>(
  ctx: WebpackContext
): Record<string, ModuleLoader<T>> {
  const map: Record<string, ModuleLoader<T>> = {};
  for (const key of ctx.keys()) {
    // key looks like "./page.tsx" or "./posts/[id]/page.tsx"
    // normalize to "/app/page.tsx" or "/app/posts/[id]/page.tsx"
    const normalized = "/app/" + key.replace(/^\.\//, "");
    map[normalized] = () => ctx(key) as Promise<{ default: T }>;
  }
  return map;
}

const pageModules = buildModuleMap<ComponentType<unknown>>(pageContext);
const layoutModules = buildModuleMap<
  ComponentType<{ children: React.ReactNode }>
>(layoutContext);

function filePathToSegments(filePath: string): string[] {
  // "/app/posts/[id]/page.tsx" -> ["posts", "[id]"]
  // "/app/page.tsx" -> []
  const withoutPrefix = filePath
    .replace(/^\/app\//, "")
    .replace(/(^|\/)(?:page|layout)\.tsx$/, "");
  if (!withoutPrefix) return [];
  return withoutPrefix.split("/");
}

function buildRoutePattern(segments: string[]): {
  pattern: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];

  if (segments.length === 0) {
    return { pattern: /^\/$/, paramNames };
  }

  const parts = segments.map((seg) => {
    // catch-all [...slug]
    if (seg.startsWith("[...") && seg.endsWith("]")) {
      const name = seg.slice(4, -1);
      paramNames.push(name);
      return "(.+)";
    }
    // dynamic [id]
    if (seg.startsWith("[") && seg.endsWith("]")) {
      const name = seg.slice(1, -1);
      paramNames.push(name);
      return "([^/]+)";
    }
    // static
    return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });

  return {
    pattern: new RegExp(`^/${parts.join("/")}$`),
    paramNames,
  };
}

function findLayouts(
  pageSegments: string[]
): ModuleLoader<ComponentType<{ children: React.ReactNode }>>[] {
  const result: ModuleLoader<
    ComponentType<{ children: React.ReactNode }>
  >[] = [];

  // root layout: /app/layout.tsx
  const rootKey = "/app/layout.tsx";
  if (layoutModules[rootKey]) {
    result.push(layoutModules[rootKey]);
  }

  // nested layouts for each depth
  let current = "/app";
  for (const seg of pageSegments) {
    current += `/${seg}`;
    const key = `${current}/layout.tsx`;
    if (layoutModules[key]) {
      result.push(layoutModules[key]);
    }
  }

  return result;
}

const routes: RouteEntry[] = Object.keys(pageModules)
  .map((filePath) => {
    const segments = filePathToSegments(filePath);
    const { pattern, paramNames } = buildRoutePattern(segments);
    return {
      pattern,
      paramNames,
      page: pageModules[filePath],
      layouts: findLayouts(segments),
    };
  })
  // sort: static before dynamic, shorter before longer, catch-all last
  .sort((a, b) => {
    const aHasCatchAll = a.pattern.source.includes("(.+)");
    const bHasCatchAll = b.pattern.source.includes("(.+)");
    if (aHasCatchAll !== bHasCatchAll) return aHasCatchAll ? 1 : -1;
    if (a.paramNames.length !== b.paramNames.length)
      return a.paramNames.length - b.paramNames.length;
    return 0;
  });

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

function matchRoute(pathname: string): {
  route: RouteEntry;
  params: RouteParams;
} | null {
  for (const route of routes) {
    const match = pathname.match(route.pattern);
    if (match) {
      const params: RouteParams = {};
      route.paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      return { route, params };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Lazy component cache
// ---------------------------------------------------------------------------

const lazyCache = new Map<
  Function,
  React.LazyExoticComponent<ComponentType<any>>
>();

function getLazy(loader: () => Promise<{ default: ComponentType<any> }>) {
  let cached = lazyCache.get(loader);
  if (!cached) {
    cached = lazy(loader);
    lazyCache.set(loader, cached);
  }
  return cached;
}

// ---------------------------------------------------------------------------
// Router component
// ---------------------------------------------------------------------------

function NotFound() {
  return (
    <div style={{ padding: "2rem", textAlign: "center" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 700 }}>404</h1>
      <p>Page not found</p>
    </div>
  );
}

export function Router() {
  const [pathname, setPathname] = useState(
    () => stripBase(window.location.pathname)
  );

  const navigate = useCallback((to: string) => {
    // `to` is a route path like "/about", push the full browser URL with base
    window.history.pushState(null, "", withBase(to));
    setPathname(to.startsWith("/") ? to : "/" + to);
  }, []);

  useEffect(() => {
    const onPop = () => setPathname(stripBase(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const matched = useMemo(() => matchRoute(pathname), [pathname]);

  const contextValue = useMemo(
    () => ({ pathname, params: matched?.params ?? {}, navigate }),
    [pathname, matched, navigate]
  );

  if (!matched) {
    return (
      <RouterContext.Provider value={contextValue}>
        <NotFound />
      </RouterContext.Provider>
    );
  }

  const { route } = matched;
  const Page = getLazy(route.page);

  // Wrap page in layouts (outermost first)
  let element: React.ReactNode = (
    <Suspense fallback={null}>
      <Page />
    </Suspense>
  );

  for (let i = route.layouts.length - 1; i >= 0; i--) {
    const Layout = getLazy(route.layouts[i]);
    const inner = element;
    element = (
      <Suspense fallback={null}>
        <Layout>{inner}</Layout>
      </Suspense>
    );
  }

  return (
    <RouterContext.Provider value={contextValue}>
      {element}
    </RouterContext.Provider>
  );
}
