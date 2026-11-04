import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
// Synthetic in-memory baseline only; this does not predict Cloudflare D1 network/CPU time.
const db = new DatabaseSync(":memory:");
db.exec(
  "CREATE TABLE records(id TEXT,owner TEXT,title TEXT,content TEXT,tags TEXT,pinned INTEGER,updated_at TEXT,deleted_at TEXT,status TEXT); CREATE INDEX owner_updated ON records(owner,updated_at,id); BEGIN",
);
const insert = db.prepare("INSERT INTO records VALUES(?,?,?,?,?,0,?,NULL,'active')");
for (let i = 0; i < 10000; i++)
  insert.run(
    String(i),
    i < 8000 ? "self" : "other",
    `记录 ${i} · ${i % 20 === 0 ? "项目复盘" : "阅读"}`,
    "工作记录与学习材料。".repeat(100) + (i % 50 === 0 ? "账本核对 special" : "日常记录"),
    '["资料"]',
    `2026-11-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`,
  );
db.exec("COMMIT");
const stmt = db.prepare(
  "SELECT id FROM records WHERE owner=? AND deleted_at IS NULL AND status!='archived' AND (instr(lower(title),lower(?))>0 OR instr(lower(content),lower(?))>0 OR instr(lower(tags),lower(?))>0) ORDER BY pinned DESC,updated_at DESC,id DESC LIMIT 201",
);
const results = [];
for (const q of ["读", "项目", "账本核对", "special", "不存在"]) {
  for (let i = 0; i < 3; i++) stmt.all("self", q, q, q);
  const times = [];
  let matches;
  for (let i = 0; i < 15; i++) {
    const start = performance.now();
    matches = stmt.all("self", q, q, q).length;
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  results.push({
    query: q,
    returned: matches,
    medianMs: Number(times[7].toFixed(2)),
    p95Ms: Number(times[14].toFixed(2)),
  });
}
console.log(
  JSON.stringify(
    {
      environment:
        "Node SQLite in memory, synthetic 10000 rows, self owner 8000, approximately 1000 Chinese characters per body",
      results,
    },
    null,
    2,
  ),
);
db.close();
