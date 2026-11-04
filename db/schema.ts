import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
// The stable platform ID scopes all data. Email is only a display attribute.
export const records = sqliteTable("records", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), kind: text("kind").notNull(),
  title: text("title").notNull(), content: text("content").notNull().default(""),
  tags: text("tags").notNull().default("[]"), meta: text("meta").notNull().default("{}"),
  favorite: integer("favorite").notNull().default(0), status: text("status").notNull().default("active"),
  dueAt: text("due_at"), createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
  deletedAt: text("deleted_at"), version: integer("version").notNull().default(1),
}, t => [index("records_owner_updated").on(t.owner, t.updatedAt, t.id), index("records_owner_kind").on(t.owner, t.kind, t.deletedAt)]);
export const revisions = sqliteTable("revisions", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), recordId: text("record_id").notNull(),
  snapshot: text("snapshot").notNull(), createdAt: text("created_at").notNull(),
}, t => [index("revisions_record").on(t.owner, t.recordId, t.createdAt)]);
export const audit = sqliteTable("audit", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), action: text("action").notNull(), title: text("title").notNull(),
  recordId: text("record_id"), createdAt: text("created_at").notNull(),
}, t => [index("audit_owner_created").on(t.owner, t.createdAt)]);
export const settings = sqliteTable("settings", { owner: text("owner").primaryKey(), value: text("value").notNull().default("{}") });
// Durable outbox: if blob deletion fails, the owner can retry without losing its key.
export const cleanup = sqliteTable("blob_cleanup", {
  id: text("id").primaryKey(), owner: text("owner").notNull(), key: text("key").notNull(), createdAt: text("created_at").notNull(),
});
