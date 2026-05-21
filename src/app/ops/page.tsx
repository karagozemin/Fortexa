import { redirect } from "next/navigation";

export default function OpsRedirect() {
  redirect("/settings?tab=ops");
}
