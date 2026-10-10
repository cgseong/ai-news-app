import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          AI 뉴스 콜렉터
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-muted transition-colors hover:text-foreground">
            피드
          </Link>
          <Link
            href="/settings"
            className="text-muted transition-colors hover:text-foreground"
          >
            설정
          </Link>
          <UserButton />
        </nav>
      </div>
    </header>
  );
}
