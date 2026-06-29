export function buildSecurityHeaders(): Record<string, string> {
  const isDev = process.env.NODE_ENV === "development";

  const cspDirectives = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ];

  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": cspDirectives.join("; "),
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
