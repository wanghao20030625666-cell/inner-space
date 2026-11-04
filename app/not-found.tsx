import Link from "next/link";
export default function NotFound() {
  return (
    <main className="workspace recovery-page">
      <div className="panel">
        <h1>没有找到这个页面</h1>
        <p>地址可能已经失效，回到主页查看你的内容。</p>
        <Link className="button primary" href="/">
          回到主页
        </Link>
      </div>
    </main>
  );
}
