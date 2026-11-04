import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import Markdown from "../app/components/markdown";
import DraftRecovery from "../app/components/draft-recovery";
import type { DraftData } from "../app/components/draft-state";
import type { SpaceRecord } from "../app/lib/model";
describe("safe reading and recovery UI", () => {
  it("renders task-list states without an editing side effect", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, { text: "- [ ] 未完成\n- [x] 已完成\n- [X] 大写完成" }),
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it("keeps active markup and links inert", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, {
        text: "- [ ] <script>alert(1)</script>\n[bad](javascript:alert(1))",
      }),
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
  });
  it("shows both timestamps and warns about an older draft", () => {
    const draft = {
        data: { baseVersion: 1, title: "旧草稿", content: "旧正文" } as DraftData,
        version: 2,
        updatedAt: "2025-11-04T00:00:00Z",
      },
      current = {
        title: "较新的正式内容",
        content: "新正文",
        version: 3,
        updatedAt: "2026-11-04T00:00:00Z",
      } as SpaceRecord;
    const html = renderToStaticMarkup(
      createElement(DraftRecovery, { draft, current, onRestore: () => {}, onDiscard: () => {} }),
    );
    expect(html).toContain("这份草稿可能早于");
    expect(html).toContain("旧正文");
    expect(html).toContain("新正文");
    expect(html).toContain("2025");
    expect(html).toContain("2026");
    expect(html).toContain("当前已保存内容");
  });
});
