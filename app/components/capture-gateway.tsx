"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { readCaptureHash } from "../lib/capture";
/** Use the platform's normal top-level sign-in; the payload remains in the same-origin return path. */
export default function CaptureGateway({ signedIn }: { signedIn: boolean }) {
  const [href, setHref] = useState(""),
    [valid, setValid] = useState<boolean | null>(null);
  useEffect(() => {
    const hash = location.hash;
    if (!readCaptureHash(hash)) {
      setValid(false);
      return;
    }
    setValid(true);
    if (signedIn) location.replace("/" + hash);
    else setHref("/signin-with-chatgpt?return_to=" + encodeURIComponent("/capture" + hash));
  }, [signedIn]);
  return (
    <main className="recovery-page">
      <section className="panel">
        <h1>快捷收集</h1>
        <p>
          {valid === false
            ? "快捷内容无效或过长，请重新点击收藏书签。"
            : signedIn
              ? "正在带入编辑器…"
              : "登录后继续核对网页标题和地址。这里只处理本次带入的信息。"}
        </p>
        {!signedIn && href && (
          <a className="button primary" href={href} target="_top">
            登录后继续
          </a>
        )}
        <Link className="button secondary" href="/" target="_top" prefetch={false}>
          返回私人空间
        </Link>
      </section>
    </main>
  );
}
