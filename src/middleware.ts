import { NextResponse } from "next/server";

import { buildSecurityHeaders } from "@/lib/security/headers";

export function middleware() {
  const response = NextResponse.next();

  const headers = buildSecurityHeaders();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.jpg).*)",
  ],
};
