import { NextRequest, NextResponse } from "next/server";

import { generateAgentActionWithGroq } from "@/lib/ai/groq";
import { requireAuth } from "@/lib/auth/require-auth";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/security/rate-limit";
import { agentPlanRequestSchema } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const auth = requireAuth(request, { allowedRoles: ["operator"] });

  if (!auth.ok) {
    return auth.response;
  }

  const rate = consumeRateLimit(request, {
    key: "agent-plan",
    limit: 20,
    windowMs: 60_000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded for agent planning. Try again shortly." },
      { status: 429, headers: rateLimitHeaders(rate) }
    );
  }

  try {
    const rawBody = (await request.json().catch(() => ({}))) as unknown;
    const parsed = agentPlanRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
          details: parsed.error.flatten(),
        },
        { status: 400, headers: rateLimitHeaders(rate) }
      );
    }

    const action = await generateAgentActionWithGroq(parsed.data);

    return NextResponse.json(
      {
        ok: true,
        action,
        provider: "groq",
      },
      { headers: rateLimitHeaders(rate) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate agent plan." },
      { status: 500, headers: rateLimitHeaders(rate) }
    );
  }
}
