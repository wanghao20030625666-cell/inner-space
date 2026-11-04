"use client";
import Link from "next/link";
/** A recoverable boundary keeps unexpected rendering failures inside the product. */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="workspace recovery-page">
      <div className="panel">
        <h1>页面暂时没有打开</h1>
        <p>可以重试，或回到主页继续使用。</p>
        <div>
          <button className="button primary" onClick={reset}>
            重新加载页面
          </button>
          <Link className="button secondary" href="/">
            回到主页
          </Link>
        </div>
      </div>
    </main>
  );
}
