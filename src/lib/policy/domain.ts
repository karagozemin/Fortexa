export function normalizeDomain(input: string | undefined | null): string | null {
  if (!input) {
    return null;
  }

  let domain = input.trim();

  if (!domain) {
    return null;
  }

  // Try to parse URL-like inputs to extract the hostname
  if (domain.includes("://")) {
    try {
      const url = new URL(domain);
      domain = url.hostname;
    } catch {
      return null;
    }
  }

  // Remove trailing dots
  domain = domain.replace(/\.+$/, "");

  // Convert to lowercase
  domain = domain.toLowerCase();

  // Basic validation: ensure it looks roughly like a domain/hostname
  // - No spaces
  // - Only alphanumeric characters, dots, and hyphens
  // - Starts and ends with alphanumeric character
  const domainRegex = /^[a-z0-9]([a-z0-9-\.]*[a-z0-9])?$/;
  if (!domainRegex.test(domain)) {
    return null;
  }

  return domain;
}
