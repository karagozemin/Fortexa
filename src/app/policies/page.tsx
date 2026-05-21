import { redirect } from "next/navigation";

export default function PoliciesRedirect() {
  redirect("/settings?tab=policies");
}
