const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedDomains: string[] = [];
let cacheExpiresAt = 0;

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
  } catch {
    // feed unavailable — return last good cache (or empty)
  }

  return cachedDomains;
}

/** Reset cache (for tests). */
export function resetBlocklistCache(): void {
  cachedDomains = [];
  cacheExpiresAt = 0;
}
