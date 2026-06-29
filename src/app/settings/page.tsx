import { cookies } from "next/headers";

import { ActivityTimeline } from "@/components/activity-timeline";
import { OpsDashboard } from "@/components/ops-dashboard";
import { PolicyEditor } from "@/components/policy-editor";
import { ScenariosCatalog } from "@/components/scenarios-catalog";
import { TabNav, type TabItem } from "@/components/ui/tab-nav";
import { WalletStatusCard } from "@/components/wallet-status-card";
import { AUTH_COOKIE_KEY, verifySessionToken } from "@/lib/auth/session";
import { listAuditEntries } from "@/lib/storage/audit-store";

const tabs: TabItem[] = [
  { id: "policies", label: "Policies", href: "/settings?tab=policies" },
  { id: "wallet", label: "Wallet", href: "/settings?tab=wallet" },
  { id: "scenarios", label: "Scenarios", href: "/settings?tab=scenarios" },
  { id: "ops", label: "Ops", href: "/settings?tab=ops" },
  { id: "activity", label: "Activity", href: "/settings?tab=activity" },
];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "policies" } = await searchParams;
  const activeTab = tabs.some((t) => t.id === tab) ? tab : "policies";

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(AUTH_COOKIE_KEY)?.value;
  const session = sessionToken ? verifySessionToken(sessionToken) : null;
  const userId = session?.userId;
  const entries = userId ? await listAuditEntries(userId) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <TabNav tabs={tabs} activeTab={activeTab} />

      {activeTab === "policies" ? <PolicyEditor /> : null}
      {activeTab === "wallet" ? <WalletStatusCard /> : null}
      {activeTab === "scenarios" ? <ScenariosCatalog /> : null}
      {activeTab === "ops" ? <OpsDashboard /> : null}
      {activeTab === "activity" ? <ActivityTimeline entries={entries} /> : null}
    </div>
  );
}
