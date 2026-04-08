"use client";

import { useMemo, useState } from "react";
import { Loader2, Rocket, ShieldAlert, Sparkles, ShieldCheck, AlertTriangle, Hand, OctagonX, CheckCircle2 } from "lucide-react";

import { DecisionBadge } from "@/components/decision-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuthSession } from "@/lib/auth/use-auth-session";
import { demoScenarios } from "@/lib/scenarios/seed";
import type { AgentAction } from "@/lib/types/domain";

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

type ToastItem = {
  id: string;
  kind: "success" | "error";
  text: string;
};

export function DecisionConsole() {
  const { isOperator, loading: sessionLoading } = useAuthSession();
  const [selectedScenarioId, setSelectedScenarioId] = useState(demoScenarios[0]?.id ?? "");
  const [destination, setDestination] = useState(process.env.NEXT_PUBLIC_STELLAR_DESTINATION ?? "");
  const [decisionData, setDecisionData] = useState<DecisionApiResponse | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastTxExplorerUrl, setLastTxExplorerUrl] = useState<string | null>(null);
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const selectedScenario = useMemo(
    () => demoScenarios.find((scenario) => scenario.id === selectedScenarioId),
    [selectedScenarioId]
  );

  const writeDisabled = loading || sessionLoading || !isOperator;
  const canHumanApprove = decisionData?.result.decision === "REQUIRE_APPROVAL";

  function getExplorerUrl(hash: string) {
    return `https://stellar.expert/explorer/testnet/tx/${hash}`;
  }

  function pushToast(kind: ToastItem["kind"], text: string) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, kind, text }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4500);
  }

  function renderMessageWithLinks(value: string) {
    const parts = value.split(/(https?:\/\/\S+)/g);
    return parts.map((part, index) => {
      if (/^https?:\/\//.test(part)) {
        return (
          <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {part}
          </a>
        );
      }

      return <span key={`${part}-${index}`}>{part}</span>;
    });
  }

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
        const errorMessage = "error" in payload ? payload.error : "Decision evaluation failed.";
        setMessage(errorMessage);
        pushToast("error", errorMessage);
        return;
      }

      setDecisionData(payload);
      setMessage("Decision completed and appended to audit trail.");
      pushToast("success", "Decision completed.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unexpected console failure.";
      setMessage(errorMessage);
      pushToast("error", errorMessage);
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
        const errorMessage = payload.error ?? "AI action generation failed.";
        setMessage(errorMessage);
        pushToast("error", errorMessage);
        return;
      }

      setGeneratedAction(payload.action);
      setMessage("AI generated a candidate action. Review and run policy decision.");
      pushToast("success", "AI generated action candidate.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unexpected AI planning failure.";
      setMessage(errorMessage);
      pushToast("error", errorMessage);
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
        const errorMessage = balancePayload.error ?? "Unable to load wallet source.";
        setMessage(errorMessage);
        pushToast("error", errorMessage);
        return;
      }

      const paymentPayload = {
        destination: normalizedDestination,
        amountXLM: selectedScenario.action.amountXLM.toFixed(7),
        memo: `fortexa:${selectedScenario.id}`.slice(0, 28),
      };

      if (!balancePayload.configured || balancePayload.source !== "external") {
        setMessage("Link a Stellar wallet first from Wallet page.");
        pushToast("error", "Wallet is not ready for transaction build.");
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

        const errorMessage = buildPayload.error ?? detailMessage ?? "Failed to build payment transaction XDR.";
        setMessage(errorMessage);
        pushToast("error", errorMessage);
        return;
      }

      setUnsignedXdr(buildPayload.xdr);
        setSignedXdrInput(buildPayload.xdr);
      setSourcePublicKey(buildPayload.sourcePublicKey ?? "");
      setNetworkPassphrase(buildPayload.networkPassphrase ?? "TESTNET");
      setMessage("Unsigned XDR prepared and placed in input. Submit will trigger wallet signing automatically.");
      pushToast("success", "Unsigned XDR prepared.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unexpected payment preparation failure.";
      setMessage(errorMessage);
      pushToast("error", errorMessage);
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
        pushToast("error", "Wallet signing failed or was rejected.");
        return;
      }

      setSignedXdrInput(signedXdr);
      setMessage("Freighter signing complete. Submitting signed XDR...");
      pushToast("success", "Wallet signing complete.");
      await submitSignedXdr(signedXdr);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Freighter signing failed.";
      setMessage(errorMessage);
      pushToast("error", errorMessage);
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

    if (signedXdr.includes("...")) {
      setMessage("This looks like a truncated XDR preview. Paste the full signed XDR value.");
      return;
    }

    if (unsignedXdr && signedXdr === unsignedXdr.trim()) {
      await signWithFreighter();
      return;
    }

    setLoading(true);
  setMessage("Submitting signed XDR to Stellar testnet...");
    try {
      const submitResponse = await fetch("/api/stellar/submit-signed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      });

      const submitPayload = (await submitResponse.json()) as {
        ok?: boolean;
        error?: string;
        resultCode?: string;
        operationCodes?: string[];
        explorerUrl?: string;
        payment?: { hash: string; mode: string; status: string };
      };

      if (!submitResponse.ok || submitPayload.error || !submitPayload.payment) {
        const resultDetail = submitPayload.resultCode
          ? ` (tx: ${submitPayload.resultCode}${submitPayload.operationCodes?.length ? `, ops: ${submitPayload.operationCodes.join(",")}` : ""})`
          : "";
        const errorMessage = (submitPayload.error ?? "Failed to submit signed transaction.") + resultDetail;
        setMessage(errorMessage);
        pushToast("error", errorMessage);
        return;
      }

      setLastTxHash(submitPayload.payment.hash);
      const explorerUrl = submitPayload.explorerUrl ?? getExplorerUrl(submitPayload.payment.hash);
      setLastTxExplorerUrl(explorerUrl);
      setMessage(
        `Real Stellar testnet payment submitted: ${submitPayload.payment.hash} — ${explorerUrl}`
      );
      pushToast("success", "Transaction submitted to Stellar testnet.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unexpected payment submission failure.";
      setMessage(errorMessage);
      pushToast("error", errorMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`max-w-sm rounded-lg border px-3 py-2 text-sm shadow-lg backdrop-blur ${
              toast.kind === "success"
                ? "border-emerald-500/40 bg-emerald-500/20 text-emerald-100"
                : "border-rose-500/40 bg-rose-500/20 text-rose-100"
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>

      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <p className="mb-1 inline-flex items-center gap-1 font-medium"><CheckCircle2 className="h-4 w-4" /> APPROVE</p>
          <p className="text-xs text-emerald-200/80">Executes with wallet signature path.</p>
        </div>
        <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="mb-1 inline-flex items-center gap-1 font-medium"><AlertTriangle className="h-4 w-4" /> WARN</p>
          <p className="text-xs text-amber-200/80">Allowed, with elevated risk posture.</p>
        </div>
        <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 p-3 text-sm text-violet-100">
          <p className="mb-1 inline-flex items-center gap-1 font-medium"><Hand className="h-4 w-4" /> REQUIRE_APPROVAL</p>
          <p className="text-xs text-violet-200/80">Manual operator sign-off required.</p>
        </div>
        <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-100">
          <p className="mb-1 inline-flex items-center gap-1 font-medium"><OctagonX className="h-4 w-4" /> BLOCK</p>
          <p className="text-xs text-rose-200/80">Execution denied by policy or risk.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
      <Card className="premium-panel lg:col-span-1">
        <CardHeader>
          <CardTitle>Demo Scenario Runner</CardTitle>
          <CardDescription>Select a scenario and force policy/risk decisioning before any economic action.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {demoScenarios.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => setSelectedScenarioId(scenario.id)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                selectedScenarioId === scenario.id
                  ? "border-cyan-300/55 bg-cyan-500/15"
                  : "border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)] hover:border-cyan-300/30"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-medium">{scenario.title}</p>
                <DecisionBadge decision={scenario.expectedDecision} />
              </div>
              <p className="text-xs text-[hsl(var(--muted-foreground))]">{scenario.description}</p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="premium-panel lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-blue-300" />
            Live Decision Console
          </CardTitle>
          <CardDescription>Evaluate, optionally approve, and execute signed payment on Stellar testnet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!sessionLoading && !isOperator ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTitle>Viewer mode</AlertTitle>
              <AlertDescription>Execution controls are disabled. Login as operator to run agent/payment actions.</AlertDescription>
            </Alert>
          ) : null}

          {selectedScenario ? (
            <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.22)] p-3 text-sm">
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

          <div className="space-y-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.2)] p-3">
            <p className="text-sm font-semibold inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-200" /> Live AI Agent Planner (Groq)</p>
            <Input value={agentGoal} onChange={(event) => setAgentGoal(event.target.value)} placeholder="Agent goal" />
            <textarea
              className="min-h-20 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)] px-3 py-2 text-xs"
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
              <div className="rounded-lg border border-cyan-300/30 bg-cyan-500/10 p-3 text-xs text-cyan-100">
                <p className="font-medium">{generatedAction.name}</p>
                <p>kind: {generatedAction.kind}</p>
                <p>domain: {generatedAction.domain}</p>
                <p>target: {generatedAction.target}</p>
                <p>amount: {generatedAction.amountXLM} XLM</p>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-sm text-[hsl(var(--muted-foreground))] inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan-200" /> Stellar destination for approved test payment</p>
            <Input
              value={destination}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="G... destination public key"
            />
            <Button variant="outline" onClick={prepareStellarPaymentXdr} disabled={writeDisabled || !decisionData}>
              Prepare Payment XDR
            </Button>
            <textarea
              className="min-h-24 w-full rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.45)] px-3 py-2 text-xs"
              value={signedXdrInput}
              onChange={(event) => setSignedXdrInput(event.target.value)}
              placeholder="Signed XDR will auto-fill after wallet signing (manual paste optional)"
            />
            <Button
              variant="secondary"
              onClick={() => (signedXdrInput.trim() ? submitSignedXdr() : signWithFreighter())}
              disabled={writeDisabled || (!signedXdrInput.trim() && !unsignedXdr)}
            >
              Submit Signed XDR
            </Button>
          </div>

          {decisionData ? (
            <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.22)] p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold">Decision Outcome</p>
                <DecisionBadge decision={decisionData.result.decision} />
              </div>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">{decisionData.result.explanation}</p>
              <p className="text-sm">Risk Score: {decisionData.result.riskScore}</p>
              <div className="h-2 overflow-hidden rounded-full bg-[hsl(var(--muted)/0.8)]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,rgba(34,197,94,0.9),rgba(245,158,11,0.9),rgba(244,63,94,0.9))]"
                  style={{ width: `${Math.min(100, Math.max(0, decisionData.result.riskScore * 10))}%` }}
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
                  <p className="mb-1 text-xs uppercase tracking-[0.14em] text-cyan-300">Triggered Policies</p>
                  {decisionData.result.triggeredPolicies.length ? (
                    decisionData.result.triggeredPolicies.map((rule) => <p key={rule.code}>• {rule.code}: {rule.message}</p>)
                  ) : (
                    <p>None.</p>
                  )}
                </div>
                <div className="rounded-lg border border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
                  <p className="mb-1 text-xs uppercase tracking-[0.14em] text-cyan-300">Risk Findings</p>
                  {decisionData.result.riskFindings.length ? (
                    decisionData.result.riskFindings.map((finding) => <p key={finding.code}>• {finding.code}: {finding.detail}</p>)
                  ) : (
                    <p>None.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {lastTxHash ? (
            <Alert>
              <AlertTitle>Latest payment hash</AlertTitle>
              <AlertDescription>
                <a
                  href={lastTxExplorerUrl ?? getExplorerUrl(lastTxHash)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  {lastTxExplorerUrl ?? getExplorerUrl(lastTxHash)}
                </a>
              </AlertDescription>
            </Alert>
          ) : null}

          {message ? (
            <Alert className="border-cyan-400/35 bg-cyan-500/10">
              <AlertTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                Console status
              </AlertTitle>
              <AlertDescription>{renderMessageWithLinks(message)}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
    </>
  );
}
