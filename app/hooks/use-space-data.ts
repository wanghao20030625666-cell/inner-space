"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, initialData, type Data } from "../lib/client";
import { spaceParams, canPatchRecord, patchRecordData, type SpaceFilters } from "../lib/space-data";
import type { Preferences, SpaceRecord } from "../lib/model";
/** Owns cursor/request generations so a late response cannot paint the wrong module. */
export function useSpaceData(filters: SpaceFilters, preferences: Preferences, onReset: () => void) {
  const dataKey = spaceParams(filters).toString(),
    [data, setData] = useState<Data>({ ...initialData, preferences }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [loadedKey, setLoadedKey] = useState(""),
    serial = useRef(0),
    cursor = useRef<string | null>(null),
    currentKey = useRef(dataKey),
    dataRef = useRef(data),
    reloadRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    dataRef.current = data;
    currentKey.current = dataKey;
  }, [data, dataKey]);
  const invalidate = useCallback(() => {
    serial.current++;
  }, []);
  const reload = useCallback(
    async (append = false) => {
      const id = ++serial.current;
      setError("");
      if (!append) setLoading(true);
      try {
        const p = new URLSearchParams(dataKey);
        if (append && cursor.current) {
          p.set("cursor", cursor.current);
          p.set("lite", "1");
        }
        const result = await api<Data>(`/api/space?${p}`);
        if (id !== serial.current || currentKey.current !== dataKey) return;
        cursor.current = result.nextCursor;
        setData((prev) => ({
          ...prev,
          ...result,
          items: append
            ? [
                ...prev.items,
                ...result.items.filter((r) => !prev.items.some((old) => old.id === r.id)),
              ]
            : result.items,
        }));
        setLoadedKey(dataKey);
        if (!append) onReset();
      } catch (e) {
        if (id === serial.current) setError(e instanceof Error ? e.message : "加载失败");
      } finally {
        if (id === serial.current) setLoading(false);
      }
    },
    [dataKey, onReset],
  );
  useEffect(() => {
    reloadRef.current = () => reload();
    void reload();
    return invalidate;
  }, [reload, invalidate]);
  const refreshCurrent = useCallback(() => reloadRef.current(), []);
  const applyRecord = useCallback(
    (before: SpaceRecord | undefined, item: SpaceRecord) => {
      if (
        currentKey.current !== dataKey ||
        !canPatchRecord(new URLSearchParams(dataKey), before, item, dataRef.current.nextCursor)
      )
        return false;
      setData((prev) =>
        patchRecordData(prev, item, new URLSearchParams(dataKey).get("sort") || "updated"),
      );
      return true;
    },
    [dataKey],
  );
  return { data, setData, loading, error, dataKey, loadedKey, reload, refreshCurrent, applyRecord };
}
