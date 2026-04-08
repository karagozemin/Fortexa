import { WalletStatusCard } from "@/components/wallet-status-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WalletPage() {
  return (
    <main className="space-y-6">
      <Card className="border-cyan-300/20 bg-[linear-gradient(180deg,rgba(15,29,55,0.6),rgba(10,16,31,0.6))]">
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
