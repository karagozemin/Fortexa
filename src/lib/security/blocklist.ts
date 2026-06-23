const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedDomains: string[] = [];
let cacheExpiresAt = 0;
let lastRefreshAt: string | null = null;
let lastErrorSummary: string | null = null;

export type BlocklistHealth = {
  configured: boolean;
  lastRefreshAt: string | null;
  domainCount: number;
  lastError: string | null;
};

/** Return current blocklist feed health without triggering a refresh. */
export function getBlocklistHealth(): BlocklistHealth {
  return {
    configured: Boolean(process.env.FORTEXA_BLOCKLIST_URL),
    lastRefreshAt,
    domainCount: cachedDomains.length,
    lastError: lastErrorSummary,
  };
}

/** Fetch and cache the external blocklist. Returns [] on any failure. */
export async function fetchBlocklist(): Promise<string[]> {
  const url = process.env.FORTEXA_BLOCKLIST_URL;
  if (!url) return [];

  if (Date.now() < cacheExpiresAt) return cachedDomains;

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const text = await res.text();
    let domains: string[];

    try {
      const json = JSON.parse(text);
      domains = Array.isArray(json) ? json.map(String) : [];
    } catch {
      // plain-text: one domain per line, strip comments and blanks
      domains = text
        .split("\n")
        .map((l) => l.trim().replace(/^#.*/, ""))
        .filter(Boolean);
    }

    cachedDomains = domains;
    cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    lastRefreshAt = new Date().toISOString();
    lastErrorSummary = null;
  } catch (err) {
    lastErrorSummary = err instanceof Error ? err.message : "Unknown fetch error";
  }

  return cachedDomains;
}

/** Reset cache (for tests). */
export function resetBlocklistCache(): void {
  cachedDomains = [];
  cacheExpiresAt = 0;
  lastRefreshAt = null;
  lastErrorSummary = null;
}
