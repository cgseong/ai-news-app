"use client";

import { useLinkStatus } from "next/link";

/**
 * Navigation feedback for a <Link> whose destination is server-rendered.
 * Must be rendered inside the <Link> it reports on. A prefetched, ready link
 * never goes pending, so this stays invisible on fast navigations.
 */
export function PendingDot() {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return (
    <span
      aria-hidden
      className="ml-1.5 inline-block size-1.5 animate-pulse rounded-full bg-current align-middle"
    />
  );
}
