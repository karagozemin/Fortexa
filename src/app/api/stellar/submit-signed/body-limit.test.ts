import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/stellar/submit-signed/route";
import { AUTH_COOKIE_KEY, createSessionToken } from "@/lib/auth/session";
import { DEFAULT_JSON_BODY_MAX_BYTES } from "@/lib/http/read-json-body";

function operatorCookie() {
  process.env.FORTEXA_AUTH_SECRET = "submit-signed-body-limit-secret";
  const token = createSessionToken({
    email: "operator@fortexa.local",
    role: "operator",
    userId: "submit-signed-body-limit-operator",
    expiresInSeconds: 120,
  });

  return `${AUTH_COOKIE_KEY}=${token}`;
}

describe("POST /api/stellar/submit-signed body limits", () => {
  it("returns 413 for oversized JSON payloads", async () => {
    const padding = "x".repeat(DEFAULT_JSON_BODY_MAX_BYTES);
    const request = new NextRequest("http://localhost/api/stellar/submit-signed", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: operatorCookie(),
      },
      body: `{"signedXdr":"${padding}"}`,
    });

    const response = await POST(request);
    expect(response.status).toBe(413);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toContain("byte limit");
  });

  it("returns validation error for malformed small JSON", async () => {
    const request = new NextRequest("http://localhost/api/stellar/submit-signed", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: operatorCookie(),
      },
      body: "{not-json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);

    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe("Invalid signed transaction submission.");
  });
});
