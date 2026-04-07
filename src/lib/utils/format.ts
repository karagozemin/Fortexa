export function truncateMiddle(value: string, left = 6, right = 6) {
  if (value.length <= left + right + 3) {
    return value;
  }
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

export function decisionVariant(decision: string): "approve" | "warn" | "require" | "block" | "default" {
  if (decision === "APPROVE") return "approve";
  if (decision === "WARN") return "warn";
  if (decision === "REQUIRE_APPROVAL") return "require";
  if (decision === "BLOCK") return "block";
  return "default";
}
