import { Link } from "@/router";

export default function About() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="flex w-full max-w-3xl flex-col gap-8 py-32 px-16">
        <Link
          href="/"
          className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          &larr; Back home
        </Link>
        <h1 className="text-3xl font-semibold text-black dark:text-zinc-50">
          About
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400">
          This is a static route at <code className="font-mono">app/about/page.tsx</code>.
        </p>
      </main>
    </div>
  );
}
