"use client";

import { useMemo, useState } from "react";
import { Loader2, Rocket, ShieldAlert } from "lucide-react";

import { DecisionBadge } from "@/components/decision-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { demoScenarios } from "@/lib/scenarios/seed";
import { truncateMiddle } from "@/lib/utils/format";

type DecisionApiResponse = {
  result: {
    decision: "APPROVE" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
    explanation: string;
    riskScore: number;
    triggeredPolicies: Array<{ code: string; message: string }>;
    riskFindings: Array<{ code: string; detail: string }>;
  };
  usage: {
    spentXLM: number;
    toolCalls: number;
  };
};

type DemoRunResponse = {
  ok: boolean;
  summary: Array<{
    scenarioId: string;
    title: string;
    decision: "APPROVE" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
    explanation: string;
    stellarTxHash?: string;
  }>;
};

type BalanceApiResponse = {
  configured: boolean;
  source?: "freighter";
  publicKey?: string;
  network?: string;
  error?: string;
  message?: string;
};

export function DecisionConsole() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(demoScenarios[0]?.id ?? "");
  const [destination, setDestination] = useState(process.env.NEXT_PUBLIC_STELLAR_DESTINATION ?? "");
  const [decisionData, setDecisionData] = useState<DecisionApiResponse | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [demoSummary, setDemoSummary] = useState<DemoRunResponse["summary"]>([]);

  const selectedScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === selectedScenarioId),
    [selectedScenarioId]
  );

  async function runDecision(approvedByHuman = false) {
    if (!selectedScenario) return;
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: selectedScenario.id, approvedByHuman }),
      });

      const payload = (await response.json()) as DecisionApiResponse | { error: string };
      if (!response.ok || "error" in payload) {
        setMessage("error" in payload ? payload.error : "Decision evaluation failed.");
        return;
      }

      setDecisionData(payload);
      setMessage("Decision completed and appended to audit trail.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected console failure.");
    } finally {
      setLoading(false);
    }
  }

  async function executeStellarPayment() {
    if (!selectedScenario || !destination) {
      setMessage("Provide destination address for payment execution.");
      return;
    }

    setLoading(true);

    try {
      const balanceResponse = await fetch("/api/stellar/balance");
      const balancePayload = (await balanceResponse.json()) as BalanceApiResponse;

      if (!balanceResponse.ok || balancePayload.error) {
        setMessage(balancePayload.error ?? "Unable to load wallet source.");
        return;
      }

      const paymentPayload = {
        destination,
        amountXLM: selectedScenario.action.amountXLM.toFixed(7),
        memo: `fortexa:${selectedScenario.id}`,
      };

      if (!balancePayload.configured || balancePayload.source !== "freighter") {
        setMessage("Connect Freighter wallet first. Direct custodial payment path is disabled.");
        return;
      }

      const buildResponse = await fetch("/api/stellar/build-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentPayload),
      });

      const buildPayload = (await buildResponse.json()) as {
        ok?: boolean;
        error?: string;
        xdr?: string;
        sourcePublicKey?: string;
        networkPassphrase?: string;
      };

      if (!buildResponse.ok || buildPayload.error || !buildPayload.xdr) {
        setMessage(buildPayload.error ?? "Failed to build Freighter transaction.");
        return;
      }

      const freighter = await import("@stellar/freighter-api");
      const signedResult = await freighter.signTransaction(buildPayload.xdr, {
        networkPassphrase: buildPayload.networkPassphrase,
        address: buildPayload.sourcePublicKey,
        accountToSign: buildPayload.sourcePublicKey,
      } as never);

      const signedXdr =
        typeof signedResult === "string"
          ? signedResult
          : (signedResult as { signedTxXdr?: string; signedTransaction?: string }).signedTxXdr ??
            (signedResult as { signedTxXdr?: string; signedTransaction?: string }).signedTransaction;

      if (!signedXdr) {
        setMessage("Freighter transaction signing failed or was rejected.");
        return;
      }

      const submitResponse = await fetch("/api/stellar/submit-signed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      });

      const submitPayload = (await submitResponse.json()) as {
        ok?: boolean;
        error?: string;
        payment?: { hash: string; mode: string; status: string };
      };

      if (!submitResponse.ok || submitPayload.error || !submitPayload.payment) {
        setMessage(submitPayload.error ?? "Failed to submit Freighter-signed transaction.");
        return;
      }

      setLastTxHash(submitPayload.payment.hash);
      setMessage(`Freighter signed + submitted Stellar testnet payment: ${submitPayload.payment.hash}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected payment failure.");
    } finally {
      setLoading(false);
    }
  }

  async function runHackathonDemoMode() {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/demo/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination }),
      });

      const payload = (await response.json()) as DemoRunResponse | { error: string };
      if (!response.ok || "error" in payload) {
        setMessage("error" in payload ? payload.error : "Demo mode failed.");
        return;
      }

      setDemoSummary(payload.summary);
      const withTx = payload.summary.find((item) => item.stellarTxHash)?.stellarTxHash;
      if (withTx) {
        setLastTxHash(withTx);
      }

      setMessage("Hackathon Demo Mode completed. Audit trail now includes full narrative sequence.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Demo mode crashed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Demo Scenario Runner</CardTitle>
          <CardDescription>Pick a flow and force Fortexa to evaluate before execution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {demoScenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setSelectedScenarioId(scenario.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                selectedScenarioId === scenario.id
                  ? "border-blue-400/60 bg-blue-500/20"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)]"
              }`}
            >
              <p className="font-medium">{scenario.title}</p>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{scenario.description}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-300" />
            Live Decision Console
          </CardTitle>
          <CardDescription>Evaluate, optionally approve, and execute payment on Stellar testnet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedScenario ? (
            <div className="rounded-xl border border-[hsl(var(--border))] p-3 text-sm">
              <p className="font-semibold">{selectedScenario.title}</p>
              <p className="text-[hsl(var(--muted-foreground))]">{selectedScenario.description}</p>
              <p className="mt-2 text-[hsl(var(--muted-foreground))]">
                {selectedScenario.action.amountXLM} XLM → {selectedScenario.action.domain}
              </p>
            </div>
          ) : null}

          <div className="grid gap-2 md:grid-cols-2">
            <Button onClick={() => runDecision(false)} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Evaluate Action
            </Button>
            <Button variant="secondary" onClick={() => runDecision(true)} disabled={loading}>
              Human Approve & Re-run
            </Button>
          </div>

          <Button variant="outline" onClick={runHackathonDemoMode} disabled={loading}>
            Run Hackathon Demo Mode
          </Button>

          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Stellar destination for approved test payment</p>
            <Input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G... destination public key"
            />
            <Button variant="outline" onClick={executeStellarPayment} disabled={loading || !decisionData}>
              Execute Stellar Payment
            </Button>
          </div>

          {decisionData ? (
            <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Decision Outcome</p>
                <DecisionBadge decision={decisionData.result.decision} />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{decisionData.result.explanation}</p>
              <p className="text-sm">Risk Score: {decisionData.result.riskScore}</p>
              <div className="space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                {decisionData.result.triggeredPolicies.map((rule) => (
                  <p key={rule.code}>• {rule.code}: {rule.message}</p>
                ))}
                {decisionData.result.riskFindings.map((finding) => (
                  <p key={finding.code}>• {finding.code}: {finding.detail}</p>
                ))}
              </div>
            </div>
          ) : null}

          {lastTxHash ? (
            <Alert>
              <AlertTitle>Latest payment hash</AlertTitle>
              <AlertDescription>{truncateMiddle(lastTxHash, 12, 12)}</AlertDescription>
            </Alert>
          ) : null}

          {demoSummary.length > 0 ? (
            <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-4">
              <p className="font-semibold">Demo Mode Summary</p>
              {demoSummary.map((item) => (
                <div key={item.scenarioId} className="flex items-center justify-between gap-2 rounded-lg bg-[hsl(var(--muted)/0.35)] p-2 text-sm">
                  <div>
                    <p>{item.title}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.explanation}</p>
                  </div>
                  <DecisionBadge decision={item.decision} />
                </div>
              ))}
            </div>
          ) : null}

          {message ? (
            <Alert className="border-blue-500/40 bg-blue-500/10">
              <AlertTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Console status
              </AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
