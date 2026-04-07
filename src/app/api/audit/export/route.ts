import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth/require-auth";
import { jsonWithRequestContext } from "@/lib/observability/http";
import { getRequestLogContext, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { listAllAuditEntriesByUser, listAuditEntries } from "@/lib/storage/audit-store";

function toCsv(rows: Array<Record<string, string | number | boolean | null>>) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0] ?? {});
  const escape = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;
  const lines = [headers.join(",")];

  for (const row of rows) {
    const line = headers.map((header) => escape(String(row[header] ?? ""))).join(",");
    lines.push(line);
  }

  return `${lines.join("\n")}\n`;
}

export async function GET(request: NextRequest) {
  const startedAtMs = Date.now();
  const context = getRequestLogContext(request, "/api/audit/export");
  const auth = requireAuth(request);

  if (!auth.ok) {
    logWarn("Audit export unauthorized", context);
    return auth.response;
  }

  const format = request.nextUrl.searchParams.get("format")?.toLowerCase() ?? "json";
  const scope = request.nextUrl.searchParams.get("scope")?.toLowerCase() ?? "mine";

  try {
    const isOperator = auth.session.role === "operator";
    const exportAll = isOperator && scope === "all";

    if (format !== "json" && format !== "csv") {
      return jsonWithRequestContext(request, {
        route: "/api/audit/export",
        startedAtMs,
        status: 400,
        body: { error: "format must be json or csv" },
      });
    }

    if (exportAll) {
      const all = await listAllAuditEntriesByUser();

      if (format === "json") {
        logInfo("Audit export success (all/json)", { ...context, userId: auth.session.userId });
        return jsonWithRequestContext(request, {
          route: "/api/audit/export",
          startedAtMs,
          status: 200,
          body: {
            scope: "all",
            exportedBy: auth.session.userId,
            entriesByUser: all,
          },
        });
      }

      const rows: Array<Record<string, string | number | boolean | null>> = [];
      for (const [userId, entries] of Object.entries(all)) {
        for (const entry of entries) {
          rows.push({
            userId,
            id: entry.id,
            timestamp: entry.timestamp,
            decision: entry.decision,
            actionId: entry.action.id,
            actionName: entry.action.name,
            domain: entry.action.domain,
            amountXLM: entry.action.amountXLM,
            explanation: entry.explanation,
          });
        }
      }

      logInfo("Audit export success (all/csv)", { ...context, userId: auth.session.userId });
      return new NextResponse(toCsv(rows), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=fortexa-audit-all.csv",
          "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
        },
      });
    }

    const mine = await listAuditEntries(auth.session.userId);

    if (format === "json") {
      logInfo("Audit export success (mine/json)", { ...context, userId: auth.session.userId });
      return jsonWithRequestContext(request, {
        route: "/api/audit/export",
        startedAtMs,
        status: 200,
        body: {
          scope: "mine",
          userId: auth.session.userId,
          entries: mine,
        },
      });
    }

    const rows = mine.map((entry) => ({
      userId: auth.session.userId,
      id: entry.id,
      timestamp: entry.timestamp,
      decision: entry.decision,
      actionId: entry.action.id,
      actionName: entry.action.name,
      domain: entry.action.domain,
      amountXLM: entry.action.amountXLM,
      explanation: entry.explanation,
    }));

    logInfo("Audit export success (mine/csv)", { ...context, userId: auth.session.userId });
    return new NextResponse(toCsv(rows), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=fortexa-audit-mine.csv",
        "x-request-id": request.headers.get("x-request-id") ?? crypto.randomUUID(),
      },
    });
  } catch (error) {
    logError("Audit export internal error", {
      ...context,
      userId: auth.session.userId,
      detail: error instanceof Error ? error.message : "unknown",
    });

    return jsonWithRequestContext(request, {
      route: "/api/audit/export",
      startedAtMs,
      status: 500,
      body: {
        error: error instanceof Error ? error.message : "Failed to export audit data.",
      },
    });
  }
}
