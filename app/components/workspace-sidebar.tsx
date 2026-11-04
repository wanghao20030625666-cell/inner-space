"use client";
import { Plus, ChevronRight, Settings2, UserRound } from "lucide-react";
import { modules, extraModules, type Module } from "../lib/catalog";
import { countByView, type Data } from "../lib/client";
import type { View } from "../lib/model";
/** Navigation owns no record mutation state; route and collection choices stay explicit. */
export default function WorkspaceSidebar({
  data,
  user,
  view,
  collectionId,
  sidebar,
  navigate,
  addCollection,
}: {
  data: Data;
  user: { name: string; email: string };
  view: View;
  collectionId: string;
  sidebar: boolean;
  navigate: (view: View, collection?: string) => void;
  addCollection: () => void;
}) {
  const count = (v: View) => countByView(data.counts, v);
  return (
    <>
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <a
          className="brand"
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
            <i />
          </span>
          <strong>隐序</strong>
          <small>个人空间</small>
        </a>
        <button className="space-switch" onClick={() => navigate("settings")}>
          <span className="space-avatar">{data.preferences.name.slice(0, 1)}</span>
          <span>
            <strong>{data.preferences.name}</strong>
            <small>当前登录账户的空间</small>
          </span>
          <ChevronRight size={14} />
        </button>
        <div className="nav-scroll">
          <nav aria-label="工作空间">
            {modules.slice(0, 2).map((m) => (
              <NavItem
                key={m.id}
                m={m}
                active={view === m.id}
                count={m.id === "inbox" ? count(m.id) : undefined}
                onClick={() => navigate(m.id)}
              />
            ))}
            <div className="nav-label">记录与安排</div>
            {modules.slice(2, 7).map((m) => (
              <NavItem key={m.id} m={m} active={view === m.id} onClick={() => navigate(m.id)} />
            ))}
            <div className="nav-label">资料与生活</div>
            {modules.slice(7).map((m) => (
              <NavItem key={m.id} m={m} active={view === m.id} onClick={() => navigate(m.id)} />
            ))}
            <div className="nav-label nav-collection-label">
              我的专题
              <button onClick={addCollection} aria-label="新建专题">
                <Plus size={14} />
              </button>
            </div>
            {data.collections.map((c) => (
              <button
                key={c.id}
                className={`nav-item collection-nav ${view === "collection" && collectionId === c.id ? "active" : ""}`}
                onClick={() => navigate("collection", c.id)}
              >
                <i className={`collection-dot ${c.color}`} />
                <span>{c.name}</span>
                <small>{c.count}</small>
              </button>
            ))}
            {!data.collections.length && (
              <button className="new-collection-link" onClick={addCollection}>
                <Plus size={13} />
                建一个专题
              </button>
            )}
            <div className="nav-divider" />
            {extraModules.slice(0, 3).map((m) => (
              <NavItem key={m.id} m={m} active={view === m.id} onClick={() => navigate(m.id)} />
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <NavItem
            m={extraModules[4]}
            active={view === "settings"}
            onClick={() => navigate("settings")}
          />
          <button className="account" onClick={() => navigate("settings")}>
            <span className="account-avatar">
              <UserRound size={17} />
            </span>
            <span>
              <strong>{user.name === "我的空间" ? data.preferences.name : user.name}</strong>
              <small>账户与数据</small>
            </span>
            <Settings2 size={15} />
          </button>
        </div>
      </aside>
    </>
  );
}

function NavItem({
  m,
  active,
  count,
  onClick,
}: {
  m: Module;
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <m.icon size={17} />
      <span>{m.name}</span>
      {count !== undefined && count > 0 && <small>{count}</small>}
    </button>
  );
}
