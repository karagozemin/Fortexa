import { PolicyEditor } from "@/components/policy-editor";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PoliciesPage() {
  return (
    <main className="space-y-6">
      <Card className="border-cyan-300/20 bg-[linear-gradient(180deg,rgba(15,29,55,0.6),rgba(10,16,31,0.6))]">
        <CardHeader>
          <CardDescription>Policy Control Plane</CardDescription>
          <CardTitle className="text-2xl">Policy Configuration</CardTitle>
          <CardDescription>Edit guardrails, review version history, and safely rollback when needed.</CardDescription>
        </CardHeader>
      </Card>
      <PolicyEditor />
    </main>
  );
}
