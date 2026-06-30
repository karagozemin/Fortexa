import { NextRequest } from "next/server";

import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logInfo } from "@/lib/observability/logger";
import { getBlocklistHealth } from "@/lib/security/blocklist";
import { getHorizonServer } from "@/lib/stellar/client";
import { runWithDatabase } from "@/lib/storage/db";

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/health");

  logInfo("Health check requested", context);

  const env = {
    hasGroqKey: Boolean(process.env.GROQ_API_KEY),
    hasAuthSecret: Boolean(process.env.FORTEXA_AUTH_SECRET),
    hasHorizonUrl: Boolean(process.env.STELLAR_HORIZON_URL),
  };

  const storageCheck = await runWithDatabase("health-check", (pool) => pool.query("SELECT 1"));
  const storageStatus = storageCheck.available ? "healthy" : "degraded";

  let horizonStatus = "unknown";
  if (env.hasHorizonUrl) {
    try {
      await getHorizonServer().root();
      horizonStatus = "healthy";
    } catch {
      horizonStatus = "degraded";
    }
  }

  const blocklistData = getBlocklistHealth();
  let blocklistStatus = "unconfigured";
  if (blocklistData.configured) {
    blocklistStatus = blocklistData.lastError ? "degraded" : "healthy";
  }

  const groqStatus = env.hasGroqKey ? "healthy" : "unconfigured";

  const dependencies = {
    storage: storageStatus,
    horizon: horizonStatus,
    blocklist: blocklistStatus,
    groq: groqStatus,
  };

  return jsonWithRequestContext(request, {
    route: "/api/health",
    startedAtMs,
    status: 200,
    body: {
      ok: true,
      service: "fortexa",
      timestamp: new Date().toISOString(),
      env,
      blocklist: blocklistData,
      dependencies,
    },
  });
}
