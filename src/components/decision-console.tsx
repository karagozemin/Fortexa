"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Play,
  Hand,
} from "lucide-react";

import { DecisionBadge } from "@/components/decision-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Stepper } from "@/components/ui/stepper";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { demoScenarios } from "@/lib/scenarios/seed";
import type { AgentAction } from "@/lib/types/domain";
import { cn } from "@/lib/utils/cn";

type DecisionApiResponse = {
  result: {
    decision: "APPROVE" | "WARN" | "REQUIRE_APPROVAL" | "BLOCK";
    explanation: string;
    riskScore: number;
    requiresManualApproval?: boolean;
    triggeredPolicies: Array<{ code: string; message: string }>;
    riskFindings: Array<{ code: string; detail: string }>;
  };
  usage: { spentXLM: number; toolCalls: number };
};

type BalanceApiResponse = {
  configured: boolean;
  source?: "external";
  publicKey?: string;
  network?: string;
  error?: string;
};

type BuildPaymentResponse = {
  ok?: boolean;
  error?: string;
  details?: { fieldErrors?: Record<string, string[] | undefined> };
  xdr?: string;
  sourcePublicKey?: string;
  networkPassphrase?: string;
};

type AgentPlanResponse = { ok?: boolean; error?: string; action?: AgentAction };

type ToastItem = { id: string; kind: "success" | "error"; text: string };

const WIZARD_STEPS = [
  { id: 1, label: "Intent" },
  { id: 2, label: "Evaluate" },
  { id: 3, label: "Approve" },
  { id: 4, label: "Execute" },
];

export function DecisionConsole() {
  const { isOperator, loading: sessionLoading } = useAuthSession();
  const [step, setStep] = useState(1);
  const [intentMode, setIntentMode] = useState<"scenario" | "ai">("scenario");
  const [selectedScenarioId, setSelectedScenarioId] = useState(demoScenarios[0]?.id ?? "");
  const [destination, setDestination] = useState(process.env.NEXT_PUBLIC_STELLAR_DESTINATION ?? "");
  const [decisionData, setDecisionData] = useState<DecisionApiResponse | null>(null);
  const [lastTxExplorerUrl, setLastTxExplorerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unsignedXdr, setUnsignedXdr] = useState("");
  const [signedXdrInput, setSignedXdrInput] = useState("");
  const [sourcePublicKey, setSourcePublicKey] = useState("");
  const [networkPassphrase, setNetworkPassphrase] = useState("TESTNET");
  const [agentGoal, setAgentGoal] = useState("Find safe market data provider and pay for premium query results.");
  const [agentContext, setAgentContext] = useState("Need reliable source with low risk and clear policy-compliant endpoint.");
  const [generatedAction, setGeneratedAction] = useState<AgentAction | null>(null);
  const [generatingAction, setGeneratingAction] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const selectedScenario = useMemo(
    () => demoScenarios.find((s) => s.id === selectedScenarioId),
    [selectedScenarioId]
  );

  const writeDisabled = loading || sessionLoading || !isOperator;
  const canHumanApprove = decisionData?.result.decision === "REQUIRE_APPROVAL";

  const activeAction = generatedAction ?? selectedScenario?.action;

  function getExplorerUrl(hash: string) {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  }

  function pushToast(kind: ToastItem["kind"], text: string) {
    const id = crypto.randomUUID();
    setToasts((c) => [...c, { id, kind, text }]);
    setTimeout(() => setToasts((c) => c.filter((t) => t.id !== id)), 4500);
  }

  function ensureOperator() {
    if (isOperator) return true;
    setMessage("Viewer role is read-only. Login as operator to execute.");
    return false;
  }

  async function runDecision(approvedByHuman = false, actionOverride?: AgentAction) {
    if (!ensureOperator()) return;
    if (!selectedScenario && !actionOverride && !generatedAction) return;

    if (approvedByHuman && !canHumanApprove) {
      setMessage("Human approval applies only after REQUIRE_APPROVAL decision.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const requestBody = actionOverride
        ? { action: actionOverride, approvedByHuman }
        : generatedAction && intentMode === "ai"
          ? { action: generatedAction, approvedByHuman }
          : { scenarioId: selectedScenario?.id, approvedByHuman };

      const response = await fetch("/api/decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const payload = (await response.json()) as DecisionApiResponse | { error: string };
      if (!response.ok || "error" in payload) {
        const err = "error" in payload ? payload.error : "Decision evaluation failed.";
        setMessage(err);
        pushToast("error", err);
        return;
      }

      setDecisionData(payload);
      setMessage("Decision recorded in audit trail.");
      pushToast("success", "Evaluation complete.");
      setStep(payload.result.decision === "REQUIRE_APPROVAL" ? 3 : payload.result.decision === "BLOCK" ? 2 : 4);
    } catch (error) {
      const err = error instanceof Error ? error.message : "Unexpected failure.";
      setMessage(err);
      pushToast("error", err);
    } finally {
      setLoading(false);
    }
  }

  async function generateActionWithAi() {
    if (!ensureOperator()) return;
    setGeneratingAction(true);
    setMessage(null);

    try {
      const response = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: agentGoal.trim(),
          context: agentContext.trim() || undefined,
          destinationHint: destination || undefined,
        }),
      });

      const payload = (await response.json()) as AgentPlanResponse;
      if (!response.ok || payload.error || !payload.action) {
        const err = payload.error ?? "AI action generation failed.";
        setMessage(err);
        pushToast("error", err);
        return;
      }

      setGeneratedAction(payload.action);
      pushToast("success", "Action generated.");
    } catch (error) {
      const err = error instanceof Error ? error.message : "AI planning failed.";
      setMessage(err);
      pushToast("error", err);
    } finally {
      setGeneratingAction(false);
    }
  }

  async function prepareStellarPaymentXdr() {
    if (!ensureOperator()) return;
    const normalizedDestination = destination.trim().toUpperCase();
    if (!selectedScenario || !normalizedDestination) {
      setMessage("Provide a valid destination address.");
      return;
    }
    if (!/^G[A-Z2-7]{55}$/u.test(normalizedDestination)) {
      setMessage("Destination must be a valid Stellar public key (G...).");
      return;
    }

    setLoading(true);
    try {
      const balanceResponse = await fetch("/api/stellar/balance");
      const balancePayload = (await balanceResponse.json()) as BalanceApiResponse;

      if (!balanceResponse.ok || balancePayload.error) {
        setMessage(balancePayload.error ?? "Unable to load wallet.");
        return;
      }

      if (!balancePayload.configured || balancePayload.source !== "external") {
        setMessage("Link a wallet in Settings before executing payments.");
        return;
      }

      const buildResponse = await fetch("/api/stellar/build-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: normalizedDestination,
          amountXLM: selectedScenario.action.amountXLM.toFixed(7),
          memo: `fortexa:${selectedScenario.id}`.slice(0, 28),
        }),
      });

      const buildPayload = (await buildResponse.json()) as BuildPaymentResponse;
      if (!buildResponse.ok || buildPayload.error || !buildPayload.xdr) {
        setMessage(buildPayload.error ?? "Failed to build XDR.");
        return;
      }

      setUnsignedXdr(buildPayload.xdr);
      setSignedXdrInput(buildPayload.xdr);
      setSourcePublicKey(buildPayload.sourcePublicKey ?? "");
      setNetworkPassphrase(buildPayload.networkPassphrase ?? "TESTNET");
      pushToast("success", "XDR prepared.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment preparation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function signWithFreighter() {
    if (!ensureOperator() || !unsignedXdr) return;
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
        pushToast("error", "Signing rejected.");
        return;
      }

      setSignedXdrInput(signedXdr);
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
    if (!signedXdr) return;

    if (unsignedXdr && signedXdr === unsignedXdr.trim()) {
      await signWithFreighter();
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
        error?: string;
        explorerUrl?: string;
        payment?: { hash: string };
      };

      if (!submitResponse.ok || submitPayload.error || !submitPayload.payment) {
        setMessage(submitPayload.error ?? "Submit failed.");
        return;
      }

      const explorerUrl = submitPayload.explorerUrl ?? getExplorerUrl(submitPayload.payment.hash);
      setLastTxExplorerUrl(explorerUrl);
      setMessage(`Payment submitted: ${explorerUrl}`);
      pushToast("success", "Transaction submitted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submit failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Toasts */}
      <div className="fixed right-4 top-20 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "max-w-sm rounded-xl border px-4 py-2.5 text-sm shadow-xl backdrop-blur",
              toast.kind === "success"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
                : "border-rose-500/30 bg-rose-500/15 text-rose-100"
            )}
          >
            {toast.text}
          </div>
        ))}
      </div>

      <Stepper steps={WIZARD_STEPS} currentStep={step} />

      {!sessionLoading && !isOperator ? (
        <Alert className="border-amber-500/25 bg-amber-500/8">
          <AlertTitle>Viewer mode</AlertTitle>
          <AlertDescription>Login as operator to run evaluations and payments.</AlertDescription>
        </Alert>
      ) : null}

      {/* Step 1: Intent */}
      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Define intent</CardTitle>
            <CardDescription>Pick a demo scenario or generate an action with AI.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-1 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] p-1">
              {(["scenario", "ai"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setIntentMode(mode)}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-sm font-medium transition",
                    intentMode === mode
                      ? "bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))]"
                      : "text-[hsl(var(--muted-foreground))]"
                  )}
                >
                  {mode === "scenario" ? "Demo scenario" : "AI planner"}
                </button>
              ))}
            </div>

            {intentMode === "scenario" ? (
              <div className="space-y-2">
                {demoScenarios.map((scenario) => (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setSelectedScenarioId(scenario.id)}
                    className={cn(
                      "w-full rounded-xl border p-4 text-left transition",
                      selectedScenarioId === scenario.id
                        ? "border-[hsl(var(--accent)/0.4)] bg-[hsl(var(--accent)/0.06)]"
                        : "border-[hsl(var(--border))] hover:border-[hsl(var(--accent)/0.2)]"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">{scenario.title}</p>
                      <DecisionBadge decision={scenario.expectedDecision} />
                    </div>
                    <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{scenario.description}</p>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <Input value={agentGoal} onChange={(e) => setAgentGoal(e.target.value)} placeholder="Agent goal" />
                <textarea
                  className="min-h-24 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.4)]"
                  value={agentContext}
                  onChange={(e) => setAgentContext(e.target.value)}
                  placeholder="Additional context"
                />
                <Button variant="outline" onClick={generateActionWithAi} disabled={writeDisabled || generatingAction} className="gap-2">
                  {generatingAction ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Generate action
                </Button>
                {generatedAction ? (
                  <div className="rounded-xl border border-[hsl(var(--accent)/0.2)] bg-[hsl(var(--accent)/0.05)] p-4 text-sm">
                    <p className="font-medium">{generatedAction.name}</p>
                    <p className="mt-1 text-[hsl(var(--muted-foreground))]">
                      {generatedAction.amountXLM} XLM → {generatedAction.domain}
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                onClick={() => setStep(2)}
                disabled={intentMode === "ai" && !generatedAction}
                className="gap-2"
              >
                Continue <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 2: Evaluate */}
      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Evaluate</CardTitle>
            <CardDescription>Run policy and risk checks on the selected intent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeAction ? (
              <div className="rounded-xl bg-[hsl(var(--muted)/0.35)] p-4 text-sm">
                <p className="font-medium">{activeAction.name}</p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {activeAction.amountXLM} XLM → {activeAction.domain}
                </p>
              </div>
            ) : null}

            <Button onClick={() => runDecision(false)} disabled={writeDisabled} className="w-full gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run evaluation
            </Button>

            {decisionData ? (
              <div className="space-y-4 rounded-xl border border-[hsl(var(--border))] p-5">
                <div className="flex items-center justify-between">
                  <DecisionBadge decision={decisionData.result.decision} />
                  <div className="relative flex h-16 w-16 items-center justify-center">
                    <div className="risk-ring absolute inset-0 rounded-full border-2 border-[hsl(var(--accent)/0.3)]" />
                    <span className="text-lg font-semibold">{decisionData.result.riskScore}</span>
                  </div>
                </div>
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{decisionData.result.explanation}</p>
                {decisionData.result.decision === "BLOCK" ? (
                  <p className="text-sm text-rose-300">Execution blocked. Select a different intent to continue.</p>
                ) : null}
              </div>
            ) : null}

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-2">
                <ChevronLeft className="h-4 w-4" /> Back
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 3: Approve */}
      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hand className="h-5 w-5 text-violet-400" />
              Human approval
            </CardTitle>
            <CardDescription>Operator confirmation required before execution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {decisionData ? (
              <>
                <DecisionBadge decision={decisionData.result.decision} />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">{decisionData.result.explanation}</p>
                <Button onClick={() => runDecision(true)} disabled={writeDisabled || !canHumanApprove} className="w-full">
                  Approve & continue
                </Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={() => setStep(2)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* Step 4: Execute */}
      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>Execute payment</CardTitle>
            <CardDescription>Build XDR, sign with Freighter, submit to Stellar testnet.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {decisionData ? (
              <div className="flex items-center gap-3 rounded-xl bg-[hsl(var(--muted)/0.35)] p-4">
                <DecisionBadge decision={decisionData.result.decision} />
                <p className="text-sm text-[hsl(var(--muted-foreground))]">Cleared for wallet signing</p>
              </div>
            ) : null}

            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="G... destination public key"
            />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={prepareStellarPaymentXdr} disabled={writeDisabled || !decisionData}>
                Prepare XDR
              </Button>
              <Button
                onClick={() => (signedXdrInput.trim() ? submitSignedXdr() : signWithFreighter())}
                disabled={writeDisabled || (!signedXdrInput.trim() && !unsignedXdr)}
              >
                Sign & submit
              </Button>
            </div>

            {lastTxExplorerUrl ? (
              <Alert>
                <AlertTitle>Transaction submitted</AlertTitle>
                <AlertDescription>
                  <a href={lastTxExplorerUrl} target="_blank" rel="noreferrer" className="break-all underline">
                    {lastTxExplorerUrl}
                  </a>
                </AlertDescription>
              </Alert>
            ) : null}

            <Button variant="ghost" onClick={() => setStep(decisionData?.result.decision === "REQUIRE_APPROVAL" ? 3 : 2)} className="gap-2">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {message ? (
        <Alert className="border-[hsl(var(--accent)/0.2)] bg-[hsl(var(--accent)/0.05)]">
          <AlertTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4" />
            Status
          </AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
