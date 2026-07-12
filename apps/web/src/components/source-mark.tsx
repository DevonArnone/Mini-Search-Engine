import { SOURCE_BY_SLUG } from "@/lib/sources";

const SOURCE_STYLES: Record<string, string> = {
  mdn: "border-blue-200 bg-blue-50 text-blue-700",
  react: "border-cyan-200 bg-cyan-50 text-cyan-700",
  nextjs: "border-slate-300 bg-slate-50 text-slate-800",
  typescript: "border-indigo-200 bg-indigo-50 text-indigo-700",
  postgresql: "border-teal-200 bg-teal-50 text-teal-800",
};

export function SourceMark({ slug, size = "md" }: { slug: string; size?: "sm" | "md" | "lg" }) {
  const source = SOURCE_BY_SLUG.get(slug);
  const dimensions = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-11 w-11 text-xs" : "h-9 w-9 text-[11px]";

  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 place-items-center rounded-md border font-bold ${dimensions} ${SOURCE_STYLES[slug] ?? "border-line bg-slate-50 text-muted"}`}
    >
      {source?.mark ?? slug.slice(0, 2).toUpperCase()}
    </span>
  );
}
