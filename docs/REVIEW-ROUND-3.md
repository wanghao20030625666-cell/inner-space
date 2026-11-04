# 第三轮审查问题与建议清单

版本：0.4.0。日期：2026-11-04。审查方式：通读全部源码 + 运行 vitest（69 通过）、tsc、eslint（均零报错）。本清单只列**仍未处理**的项；已整改项见 REVIEW-ROUND-2.md。

每条包含：位置（文件:行）→ 问题 → 修法。可按编号独立领取修改。

---

## A. 要修的问题

### A1.【高·语义缺陷】编辑器"放弃修改"名不副实

- 位置：`app/components/editor.tsx:110-116`（close 函数）
- 问题：关闭编辑器且有修改时，先 `draftState.flush()` 把草稿**写入服务端**，再弹"有尚未保存的修改，是否放弃？"。用户点"放弃修改"后草稿仍在服务端，下次新建同类型内容会收到"找到未完成的草稿"提示。用户以为丢弃了，实际没有——语义错位。
- 修法：把确认框改为三个选项——「保留草稿并关闭」（默认，明确告知内容已存为草稿）、「彻底丢弃」（调用 `draftState.discard()` 删除服务端草稿后再 onClose）、「继续编辑」。保留"数据不丢"的设计哲学，但让用户知情选择。

### A2.【中】编辑器项目下拉漏用 lite 分页

- 位置：`app/components/editor.tsx:119`
- 问题：`/api/space?kind=project` 未带 `lite=1`，每次打开待办编辑器都触发全量响应（服务端 17 条 SQL）。此处只用 `r.items`，加 `&lite=1` 是安全的。
- 修法：改为 `/api/space?kind=project&lite=1`。

### A3.【中】项目内待办列表漏用 lite，且不能简单加

- 位置：`app/components/project-tasks.tsx:15`
- 问题：`/api/space?kind=task&project=${project.id}` 未带 `lite=1`。**注意**：该处还用 `r.projectTasks` 取完成数（第 18 行），而 lite 响应**不含** projectTasks 字段，直接加 `lite=1` 会让 `.find` 抛 TypeError。
- 修法（二选一，推荐①）：
  ① 服务端：`/api/space` 的 lite 分支补充返回 `projectTasks` 聚合（该查询本身很轻，GROUP BY 单表）；前端直接加 `lite=1`。
  ② 前端：当 `total <= items.length` 时用 items 本地计算 done；`total > 200` 时再发一次全量请求取 projectTasks。
- 附带：`project.id` 拼进 URL 时加 `encodeURIComponent`（当前是 UUID 无实际风险，属卫生项）。

### A4.【中】设置表单是 prop 快照，不随后端数据更新

- 位置：`app/components/settings.tsx:38`
- 问题：`useState(preferences)` 只在挂载时取初始值。若另一窗口改过设置，本窗口 `/api/space` 刷新后 `preferences` prop 已更新，但表单仍显示旧值；此时点保存会用旧值覆盖新设置。
- 修法：跟踪表单脏状态（对比当前表单与 prop 的序列化值），prop 变化且表单未脏时同步；表单已脏时在保存按钮旁提示"设置在别处已更新"。

### A5.【低】账本"结余"永不标色

- 位置：`app/components/ledger.tsx:26`
- 问题：结余硬编码 `positive: false`，盈余时无视觉区分。
- 修法：`positive: value.incomeCents - value.expenseCents > 0`，或给结余定义独立的中性/盈余样式。

### A6.【低】主页备注与魔法字符串比较

- 位置：`app/components/dashboard.tsx:84-87`
- 问题：`motto !== "把日常安放好，让想法慢慢生长。"` 才显示——用户若真把备注设为这句话，内容会静默消失。
- 修法：默认 motto 应为空串，删除该比较，仅判断非空。

### A7.【低】批量选择框无半选态

- 位置：`app/workspace.tsx:754`
- 问题：选中部分记录时全选 checkbox 显示未选中，无法区分"全未选"和"部分选"。
- 修法：用 ref callback 设置 `el.indeterminate = selected.length > 0 && !allSelected`。

### A8.【低】照片预览 findIndex 防御

- 位置：`app/workspace.tsx:354-359`
- 问题：`findIndex` 返回 -1 时也会 `setImageIndex(-1)`，ImageViewer 取不到 item 渲染 null，但 imageIndex 卡在 -1。正常路径几乎不可达（封面按钮只在未删除时渲染），属防御性修复。
- 修法：`const i = ...findIndex(...); if (i >= 0) setImageIndex(i);`。

### A9.【低】canPatchRecord 存在不可达分支

- 位置：`app/lib/space-data.ts:104`
- 问题：`nextCursor && sort === "due" && dueAt 变化` 检查不可达——dueAt 变化已被第 88 行的字段比较提前 return false。
- 修法：删除该分支（或在注释中说明保留理由）。

### A10.【低】两处重复的 count 聚合逻辑

- 位置：`app/components/workspace-sidebar.tsx:24-34` 与 `app/components/dashboard.tsx:47-56`
- 问题：相同的 counts→数量归并实现写了两遍，口径微调时需要改两处。
- 修法：提取 `countByKind(counts, kind, status?)` / `countByView(counts, view)` 到 `app/lib/client.ts`，两处引用。

### A11.【低】编辑器关闭时草稿保存失败无提示

- 位置：`app/components/editor.tsx:113`（close 中 flush）
- 问题：`flush()` 内部吞掉错误（状态栏提示），随后照常弹出"放弃修改"确认；用户此时不知道草稿保存已失败。
- 修法：flush 后检查 `draftState.failed`，失败时在确认框文案中注明"草稿未能保存到服务端"。

---

## B. 值得做的增强（按性价比排序）

### B1. 命令面板（Ctrl+K 升级）

当前 Ctrl+K 只聚焦搜索框。升级为命令面板：跨模块搜索 + 跳转模块 + 新建动作（新建笔记/待办/日程）。是现阶段体验提升最大的一项。可用 cmdk（精简依赖时可单独引回）或基于现有 Modal 手写。

### B2. 按专题导出

备份管线（`app/lib/backup.ts`）已是全量；加"导出某个专题"（JSON + 附件 ZIP）只需给 allRecords 传 `collection` 参数并复用现有 ZIP/校验逻辑。

### B3. 回收站保留期（可选）

设置中增加可选项（默认"永不自动清理"）：移入回收站超过 N 天的记录在写入时惰性彻底删除（复用现有 DELETE 事务 + blob_cleanup 队列）。REVIEW-ROUND-2 已标注此功能涉及不可逆行为，做时必须默认关闭。

### B4. npm audit 进 CI

`.github/workflows/ci.yml` 在 install 后加一步 `npm audit --audit-level=high`（或 `npm audit signatures`）。依赖已精简到 7 个，成本近零。

### B5. 编辑器关闭时若有上传进行中，给出明确提示

Attachments 现在用 UploadQueue（inline），关闭编辑器会取消未完成上传（UI 已有说明文案）。可进一步加强：编辑器 close 时检测队列存在 queued/uploading 项，在放弃确认中一并提示"附件上传未完成，将被取消"。

### B6. 待办看板移动端说明

HTML5 拖放在触屏不可用，按钮流转已覆盖（开始/完成/重开）。可在看板空态或提示文案中说明"移动端请用按钮流转"，避免用户误以为拖拽坏了。

---

## C. 需要你决策的（Codex 不要自行处理）

### C1. 认证信任边界（部署侧）

`chatgpt-auth.ts` 完全信任平台注入的 `oai-authenticated-user-id` 头。应用代码无法自证 workers.dev 等直连入口已禁用——伪造该头即可读写任意账户数据。请在托管平台确认直连入口已关闭，并在 `docs/ARCHITECTURE.md` 显式记录该信任前提。

### C2. 搜索升级 FTS5

当前 `instr()` 全表扫描，个人数据量下无感。如数据量上万后再评估：D1 支持 FTS5，中文需 trigram tokenizer。需要先有性能基准再决定是否迁移。

---

## 验证要求（修改完成后必须全绿）

```powershell
npm run format:check
npm run typecheck
npm run lint
npm run test:unit
npm run build
# 起本地预览后：
npm run test:integration
```

新增行为（A1 的三选项、A4 的脏跟踪）需补对应单元测试或集成用例。
