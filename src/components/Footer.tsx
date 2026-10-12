/**
 * Header의 아래쪽 짝. 같은 `max-w-6xl` 컨테이너에 테두리만 `border-t`로 뒤집었다.
 * 연도를 `new Date()`로 구하면 cacheComponents에서 레이아웃 전체가 동적으로 바뀌므로
 * 그냥 적어 둔다.
 */
export function Footer() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 text-center text-xs text-muted sm:px-6">
        Copyright 2026 AI 뉴스 수집기. Powered by Claude.
      </div>
    </footer>
  );
}
