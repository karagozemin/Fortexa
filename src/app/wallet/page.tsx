import { WalletStatusCard } from "@/components/wallet-status-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WalletPage() {
  return (
    <main className="space-y-6">
      <Card className="premium-panel border-cyan-300/20 bg-[linear-gradient(180deg,rgba(11,22,42,0.82),rgba(9,14,26,0.84))]">
        <CardHeader>
          <CardDescription>Execution Context</CardDescription>
          <CardTitle className="text-2xl">Agent Wallet & Testnet Operations</CardTitle>
          <CardDescription>
            Verify source wallet identity, balance, and signing posture before transaction execution.
          </CardDescription>
        </CardHeader>
      </Card>
      <WalletStatusCard />
    </main>
  );
}
