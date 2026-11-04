"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/client";
export type DraftData = {
  kind: import("../lib/model").Kind;
  title: string;
  content: string;
  tags: string;
  dueAt: string;
  status: import("../lib/model").SpaceRecord["status"];
  meta: import("../lib/model").SpaceRecord["meta"];
  favorite: boolean;
  pinned: boolean;
  collectionId: string | null;
};
type Saved = { data: DraftData; version: number; updatedAt: string };
/** Serializes autosaves and protects another tab's draft with its own version. */
export function useDraft(
  key: string,
  data: DraftData,
  readOnly: boolean,
  restore: (d: DraftData) => void,
) {
  const [candidate, setCandidate] = useState<Saved | null>(null),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState("正在读取草稿"),
    [failed, setFailed] = useState(false);
  const latest = useRef(data),
    baseline = useRef(JSON.stringify(data)),
    version = useRef(0),
    stopped = useRef(false),
    pending = useRef<Promise<void> | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    latest.current = data;
  }, [data]);
  useEffect(() => {
    stopped.current = false;
    let active = true;
    if (readOnly) {
      setReady(true);
      setStatus("");
      return;
    }
    api<{ draft: Saved | null }>(`/api/drafts?key=${encodeURIComponent(key)}`)
      .then((r) => {
        if (!active) return;
        if (r.draft) {
          version.current = r.draft.version;
          setCandidate(r.draft);
          setStatus("有尚未恢复的草稿");
        } else setStatus("修改后自动保存草稿");
        setReady(true);
      })
      .catch(() => {
        if (active) {
          setStatus("草稿读取失败，请重新打开；当前内容仍可手动保存");
          setFailed(true);
        }
      });
    return () => {
      active = false;
      stopped.current = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [key, readOnly]);
  const flush = useCallback(
    async function saveLatest(): Promise<void> {
      if (stopped.current || readOnly || candidate || !ready) return;
      if (pending.current) {
        await pending.current;
        return saveLatest();
      }
      const snapshot = JSON.stringify(latest.current);
      if (snapshot === baseline.current) return;
      setStatus("正在保存草稿…");
      pending.current = (async () => {
        try {
          const result = await api<{ version: number }>("/api/drafts", {
            method: "PUT",
            body: JSON.stringify({ key, version: version.current, data: JSON.parse(snapshot) }),
          });
          version.current = result.version;
          baseline.current = snapshot;
          setStatus("草稿已保存 · 尚未更新正式内容");
          setFailed(false);
        } catch (e) {
          setStatus(e instanceof Error ? e.message : "草稿保存失败，请手动保存");
          setFailed(true);
        }
      })();
      await pending.current;
      pending.current = null;
      // Keystrokes arriving during a slow request must get their own save as well.
      if (!stopped.current && JSON.stringify(latest.current) !== snapshot) await saveLatest();
    },
    [key, readOnly, candidate, ready],
  );
  useEffect(() => {
    if (!ready || candidate || readOnly) return;
    if (JSON.stringify(data) !== baseline.current) {
      setStatus("有修改，等待保存草稿");
      timer.current = setTimeout(() => void flush(), 900);
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [data, ready, candidate, readOnly, flush]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(latest.current) !== baseline.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    addEventListener("beforeunload", before);
    return () => removeEventListener("beforeunload", before);
  }, []);
  async function clear() {
    if (version.current) {
      await api("/api/drafts", {
        method: "DELETE",
        body: JSON.stringify({ key, version: version.current }),
      });
      version.current = 0;
    }
    setCandidate(null);
    setStatus("修改后自动保存草稿");
  }
  async function finish() {
    stopped.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (pending.current) await pending.current;
    try {
      await clear();
    } catch {
      /* A newer draft in another tab is intentionally kept. */
    }
  }
  return {
    ready,
    status,
    failed,
    candidate,
    flush,
    finish,
    discard: clear,
    restore: () => {
      if (candidate) {
        baseline.current = JSON.stringify(candidate.data);
        restore(candidate.data);
        setCandidate(null);
        setStatus("已恢复草稿，保存内容后正式生效");
      }
    },
  };
}
