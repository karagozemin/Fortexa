import { Badge } from "@/components/ui/badge";
import { decisionVariant } from "@/lib/utils/format";

export function DecisionBadge({ decision }: { decision: string }) {
  return <Badge variant={decisionVariant(decision)}>{decision}</Badge>;
}
