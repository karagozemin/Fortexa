import { redirect } from "next/navigation";

export default function WalletRedirect() {
  redirect("/settings?tab=wallet");
}
