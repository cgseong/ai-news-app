import { redirect } from "next/navigation";

/** One screen now — the dashboard owns collection and the card list. */
export default function HomePage() {
  redirect("/dashboard");
}
