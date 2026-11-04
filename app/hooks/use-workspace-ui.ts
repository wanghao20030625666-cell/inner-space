"use client";
import { useMemo, useReducer, type SetStateAction } from "react";
import type { Kind, SpaceRecord } from "../lib/model";
import type { EditorSeed } from "../lib/capture";
import type { TrashSnapshot } from "../lib/trash";
export type EditorState = {
  kind: Kind;
  item?: SpaceRecord;
  date?: string;
  seed?: EditorSeed;
  draftKey?: string;
};
export type WorkspaceUiState = {
  editor: EditorState | null;
  chooser: boolean;
  imageIndex: number | null;
  selected: string[];
  undo: SpaceRecord[];
  deleteItem: SpaceRecord | null;
  bulkTrash: boolean;
  trashDelete: TrashSnapshot | null;
  collectionEditor: { id?: string; name: string; color: string } | null;
  collectionError: string;
};
export const initialWorkspaceUi: WorkspaceUiState = {
  editor: null,
  chooser: false,
  imageIndex: null,
  selected: [],
  undo: [],
  deleteItem: null,
  bulkTrash: false,
  trashDelete: null,
  collectionEditor: null,
  collectionError: "",
};
type UiAction = { key: keyof WorkspaceUiState; value: unknown };
/** Keep modal, selection and undo transitions in one pure reducer. */
export function workspaceUiReducer(state: WorkspaceUiState, action: UiAction): WorkspaceUiState {
  const value =
    typeof action.value === "function"
      ? (action.value as (value: unknown) => unknown)(state[action.key])
      : action.value;
  return { ...state, [action.key]: value };
}
type Setters = {
  [K in keyof WorkspaceUiState as `set${Capitalize<K>}`]: (
    value: SetStateAction<WorkspaceUiState[K]>,
  ) => void;
};
export function useWorkspaceUi() {
  const [state, dispatch] = useReducer(workspaceUiReducer, initialWorkspaceUi);
  const setters = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(initialWorkspaceUi).map((key) => [
          `set${key[0].toUpperCase() + key.slice(1)}`,
          (value: unknown) => dispatch({ key: key as keyof WorkspaceUiState, value }),
        ]),
      ) as Setters,
    [dispatch],
  );
  return { state, ...setters };
}
export type WorkspaceUi = ReturnType<typeof useWorkspaceUi>;
