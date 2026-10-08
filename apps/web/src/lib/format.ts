// Dates from the crawler are naive ISO timestamps in UTC.
export function parseUtc(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) || !value.includes("T") ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDay(value: string | Date | null | undefined): string | null {
  const date = parseUtc(value);
  return date ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null;
}

export function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function crawlStatusLabel(status: string): string {
  if (status === "healthy") return "Up to date";
  if (status === "crawling") return "Crawl in progress";
  if (status === "failing") return "Last crawl had failures";
  return "Not crawled yet";
}

export function crawlCadence(hours: number): string {
  if (hours >= 720) return hours >= 1440 ? `every ${Math.round(hours / 720)} months` : "monthly";
  if (hours >= 168) return hours >= 336 ? `every ${Math.round(hours / 168)} weeks` : "weekly";
  if (hours >= 24) return hours >= 48 ? `every ${Math.round(hours / 24)} days` : "daily";
  return `every ${hours} hours`;
}
