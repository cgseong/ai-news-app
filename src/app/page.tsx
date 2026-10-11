import { redirect } from "next/navigation";

/**
 * One screen now. The dashboard owns collection and the card list; the client
 * `Feed` stays in the tree for the classification step, which needs its
 * pending-count polling again.
 */
export default function HomePage() {
  redirect("/dashboard");
}
