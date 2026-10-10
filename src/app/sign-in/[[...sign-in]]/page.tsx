import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">AI 뉴스 콜렉터</h1>
        <p className="mt-2 text-sm text-muted">로그인해야 뉴스를 볼 수 있습니다.</p>
      </div>
      {/* Clerk's widget reads the URL, which only exists at request time. */}
      <Suspense fallback={<div className="skeleton h-96 w-80" />}>
        <SignIn />
      </Suspense>
    </div>
  );
}
