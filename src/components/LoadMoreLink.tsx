"use client";

import Link from "next/link";

import { PendingDot } from "@/components/PendingDot";

/** "더 보기" — a link, so the widened list stays in the URL and in history. */
export function LoadMoreLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="mx-auto rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-medium transition-colors hover:border-accent/40 hover:text-accent"
    >
      더 보기
      <PendingDot />
    </Link>
  );
}
