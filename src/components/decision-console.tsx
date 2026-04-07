"use client";

import { useMemo, useState } from "react";
import { Loader2, Rocket, ShieldAlert } from "lucide-react";

import { DecisionBadge } from "@/components/decision-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { demoScenarios } from "@/lib/scenarios/seed";
import type { AgentAction } from "@/lib/types/domain";
import { truncateMiddle } from "@/lib/utils/format";

type DecisionApiResponse = {
  result: {
    decision: "APPROVE" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
    explanation: string;
    riskScore: number;
    requiresManualApproval?: boolean;
    triggeredPolicies: Array<{ code: string; message: string }>;
    riskFindings: Array<{ code: string; detail: string }>;
  };
  usage: {
    spentXLM: number;
    toolCalls: number;
  };
};

type BalanceApiResponse = {
  configured: boolean;
  source?: "external";
  provider?: string;
  publicKey?: string;
  network?: string;
  error?: string;
  message?: string;
};

type BuildPaymentResponse = {
  ok?: boolean;
  error?: string;
  details?: {
    fieldErrors?: Record<string, string[] | undefined>;
  };
  xdr?: string;
  sourcePublicKey?: string;
  networkPassphrase?: string;
};

type AgentPlanResponse = {
  ok?: boolean;
  error?: string;
  action?: AgentAction;
};

export function DecisionConsole() {
  const { isOperator, loading: sessionLoading } = useAuthSession();
  const [selectedScenarioId, setSelectedScenarioId] = useState(demoScenarios[0]?.id ?? "");
  const [destination, setDestination] = useState(process.env.NEXT_PUBLIC_STELLAR_DESTINATION ?? "");
  const [decisionData, setDecisionData] = useState<DecisionApiResponse | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unsignedXdr, setUnsignedXdr] = useState<string>("");
  const [signedXdrInput, setSignedXdrInput] = useState<string>("");
  const [sourcePublicKey, setSourcePublicKey] = useState<string>("");
  const [networkPassphrase, setNetworkPassphrase] = useState<string>("TESTNET");
  const [agentGoal, setAgentGoal] = useState<string>("Find safe market data provider and pay for premium query results.");
  const [agentContext, setAgentContext] = useState<string>("Need reliable source with low risk and clear policy-compliant endpoint.");
  const [generatedAction, setGeneratedAction] = useState<AgentAction | null>(null);
  const [generatingAction, setGeneratingAction] = useState(false);

  const selectedScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === selectedScenarioId),
    [selectedScenarioId]
  );

  const writeDisabled = loading || sessionLoading || !isOperator;
  const canHumanApprove = decisionData?.result.decision === "REQUIRE_APPROVAL";

  function ensureOperator() {
    if (isOperator) {
      return true;
    }

    setMessage("Viewer role is read-only. Login as operator for execution actions.");
    return false;
  }

  async function runDecision(approvedByHuman = false, actionOverride?: AgentAction) {
    if (!ensureOperator()) return;
    if (!selectedScenario && !actionOverride) return;

    if (approvedByHuman && !canHumanApprove) {
      setMessage("Human approval can be applied only after a REQUIRE_APPROVAL decision.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const requestBody = actionOverride
        ? { action: actionOverride, approvedByHuman }
        : { scenarioId: selectedScenario?.id, approvedByHuman };

      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

  async function generateActionWithAi() {
    if (!ensureOperator()) return;
    if (!agentGoal.trim()) {
      setMessage("Provide an agent goal first.");
      return;
    }

    setGeneratingAction(true);
    setMessage(null);

    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: agentGoal.trim(), context: agentContext.trim() || undefined, destinationHint: destination || undefined }),
      });

      const payload = (await response.json()) as AgentPlanResponse;

      if (!response.ok || payload.error || !payload.action) {
        setMessage(payload.error ?? "AI action generation failed.");
        return;
      }

      setGeneratedAction(payload.action);
      setMessage("AI generated a candidate action. Review and run policy decision.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected AI planning failure.");
    } finally {
      setGeneratingAction(false);
    }
  }

  async function prepareStellarPaymentXdr() {
    if (!ensureOperator()) return;
    const normalizedDestination = destination.trim().toUpperCase();

    if (!selectedScenario || !normalizedDestination) {
      setMessage("Provide destination address for payment execution.");
      return;
    }

    if (!/^G[A-Z2-7]{55}$/u.test(normalizedDestination)) {
      setMessage("Destination must be a valid Stellar public key (G... format). ");
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
        destination: normalizedDestination,
        amountXLM: selectedScenario.action.amountXLM.toFixed(7),
        memo: `fortexa:${selectedScenario.id}`.slice(0, 28),
      };

      if (!balancePayload.configured || balancePayload.source !== "external") {
        setMessage("Link a Stellar wallet first from Wallet page.");
        return;
      }

      const buildResponse = await fetch("/api/stellar/build-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentPayload),
      });

      const buildPayload = (await buildResponse.json()) as BuildPaymentResponse;

      if (!buildResponse.ok || buildPayload.error || !buildPayload.xdr) {
        const detailMessage =
          buildPayload.details?.fieldErrors &&
          Object.values(buildPayload.details.fieldErrors)
            .flat()
            .filter((value): value is string => Boolean(value))
            .join(" ");

        setMessage(buildPayload.error ?? detailMessage ?? "Failed to build payment transaction XDR.");
        return;
      }

      setUnsignedXdr(buildPayload.xdr);
      setSourcePublicKey(buildPayload.sourcePublicKey ?? "");
      setNetworkPassphrase(buildPayload.networkPassphrase ?? "TESTNET");
      setMessage("Unsigned XDR prepared. Sign with Freighter or another Stellar wallet, then submit signed XDR.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected payment preparation failure.");
    } finally {
      setLoading(false);
    }
  }

  async function signWithFreighter() {
    if (!ensureOperator()) return;
    if (!unsignedXdr) {
      setMessage("Prepare payment XDR first.");
      return;
    }

    setLoading(true);
    try {
      const freighter = await import("@stellar/freighter-api");
      const signedResult = await freighter.signTransaction(unsignedXdr, {
        networkPassphrase,
        address: sourcePublicKey || undefined,
        accountToSign: sourcePublicKey || undefined,
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

      setSignedXdrInput(signedXdr);
      setMessage("Freighter signing complete. Submitting signed XDR...");
      await submitSignedXdr(signedXdr);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Freighter signing failed.");
    } finally {
      setLoading(false);
    }
  }

  async function submitSignedXdr(signedXdrArg?: string) {
    if (!ensureOperator()) return;
    const signedXdr = (signedXdrArg ?? signedXdrInput).trim();
    if (!signedXdr) {
      setMessage("Paste a signed XDR first.");
      return;
    }

    setLoading(true);
    try {
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
        setMessage(submitPayload.error ?? "Failed to submit signed transaction.");
        return;
      }

      setLastTxHash(submitPayload.payment.hash);
      setMessage(`Real Stellar testnet payment submitted: ${submitPayload.payment.hash}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected payment submission failure.");
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
          {!sessionLoading && !isOperator ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTitle>Viewer mode</AlertTitle>
              <AlertDescription>Execution controls are disabled. Login as operator to run agent/payment actions.</AlertDescription>
            </Alert>
          ) : null}

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
            <Button onClick={() => runDecision(false)} disabled={writeDisabled}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Evaluate Action
            </Button>
            <Button variant="secondary" onClick={() => runDecision(true)} disabled={writeDisabled || !canHumanApprove}>
              Human Approve & Re-run
            </Button>
          </div>

          <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] p-3">
            <p className="text-sm font-semibold">Live AI Agent Planner (Groq)</p>
            <Input value={agentGoal} onChange={(event) => setAgentGoal(event.target.value)} placeholder="Agent goal" />
            <textarea
              className="min-h-20 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-xs"
              value={agentContext}
              onChange={(event) => setAgentContext(event.target.value)}
              placeholder="Context for the AI planner"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={generateActionWithAi} disabled={writeDisabled || generatingAction}>
                {generatingAction ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Generate Action with AI
              </Button>
              <Button
                variant="secondary"
                onClick={() => (generatedAction ? runDecision(false, generatedAction) : undefined)}
                disabled={writeDisabled || !generatedAction}
              >
                Evaluate Generated Action
              </Button>
            </div>
            {generatedAction ? (
              <div className="rounded-lg border border-[hsl(var(--border))] p-3 text-xs">
                <p className="font-medium">{generatedAction.name}</p>
                <p>kind: {generatedAction.kind}</p>
                <p>domain: {generatedAction.domain}</p>
                <p>target: {generatedAction.target}</p>
                <p>amount: {generatedAction.amountXLM} XLM</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Stellar destination for approved test payment</p>
            <Input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G... destination public key"
            />
            <Button variant="outline" onClick={prepareStellarPaymentXdr} disabled={writeDisabled || !decisionData}>
              Prepare Payment XDR
            </Button>
            <Button variant="outline" onClick={signWithFreighter} disabled={writeDisabled || !unsignedXdr}>
              Sign with Freighter (Optional)
            </Button>
            <textarea
              className="min-h-24 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-xs"
              value={signedXdrInput}
              onChange={(event) => setSignedXdrInput(event.target.value)}
              placeholder="Paste signed XDR (any Stellar wallet/signing flow)"
            />
            <Button variant="secondary" onClick={() => submitSignedXdr()} disabled={writeDisabled || !signedXdrInput.trim()}>
              Submit Signed XDR
            </Button>
            {unsignedXdr ? (
              <Alert>
                <AlertTitle>Unsigned XDR Ready</AlertTitle>
                <AlertDescription>{truncateMiddle(unsignedXdr, 36, 36)}</AlertDescription>
              </Alert>
            ) : null}
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
