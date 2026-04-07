import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";

export const USER_COOKIE_KEY = "fortexa_user_id";

export function getOrCreateUserId(request: NextRequest) {
  const cookieUserId = request.cookies.get(USER_COOKIE_KEY)?.value;

  if (cookieUserId) {
    return {
      userId: cookieUserId,
      shouldSetCookie: false,
    };
  }

  return {
    userId: randomUUID(),
    shouldSetCookie: true,
  };
}
