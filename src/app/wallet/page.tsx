import { WalletStatusCard } from "@/components/wallet-status-card";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function WalletPage() {
  return (
    <main className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Agent Wallet & Testnet Operations</CardTitle>
          <CardDescription>
            Lightweight wallet surface for Stellar testnet identity, balance checks, and faucet funding before payments.
          </CardDescription>
        </CardHeader>
      </Card>
      <WalletStatusCard />
    </main>
  );
}
