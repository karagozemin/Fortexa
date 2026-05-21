import { redirect } from "next/navigation";

export default function ScenariosRedirect() {
  redirect("/settings?tab=scenarios");
}
