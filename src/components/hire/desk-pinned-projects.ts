"use client";

import { useEffect, useState, useTransition, useCallback } from "react";
import { togglePinTalentProjectAction } from "@/app/actions/talent-project-actions";

export const PINNED_PROJECTS_EVENT = "klymb-hire-pinned-changed";
const STORAGE_KEY = "klymb-hire-pinned-projects";

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

export function readPinnedProjectIds(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.length > 0);
  } catch {
    return [];
  }
}

export function isProjectPinnedLocally(projectId: string): boolean {
  return readPinnedProjectIds().includes(projectId);
}

export function setProjectPinnedLocally(projectId: string, pinned: boolean): void {
  if (!canUseStorage() || !projectId) return;
  const current = new Set(readPinnedProjectIds());
  if (pinned) {
    current.add(projectId);
  } else {
    current.delete(projectId);
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]));
    window.dispatchEvent(new Event(PINNED_PROJECTS_EVENT));
  } catch {
    // Local storage write may fail if quota exceeded; silent fallback
  }
}

export function toggleProjectPinnedLocally(projectId: string): boolean {
  const currentPinned = isProjectPinnedLocally(projectId);
  const nextPinned = !currentPinned;
  setProjectPinnedLocally(projectId, nextPinned);
  return nextPinned;
}

/**
 * React hook that combines server-provided initial pinned flags with local storage,
 * and keeps all components in sync via window events.
 */
export function usePinnedProjects(initialPinnedIds?: string[]) {
  const [pinnedSet, setPinnedSet] = useState<Set<string>>(() => {
    const local = readPinnedProjectIds();
    const merged = new Set<string>(local);
    if (initialPinnedIds) {
      for (const id of initialPinnedIds) {
        if (id) merged.add(id);
      }
    }
    return merged;
  });

  const [, startTransition] = useTransition();

  useEffect(() => {
    // Sync any initial server pinned IDs into local storage if not present
    if (initialPinnedIds && initialPinnedIds.length > 0) {
      const local = readPinnedProjectIds();
      const localSet = new Set(local);
      let changed = false;
      for (const id of initialPinnedIds) {
        if (!localSet.has(id)) {
          localSet.add(id);
          changed = true;
        }
      }
      if (changed) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...localSet]));
        } catch {
          // ignore storage quota errors
        }
      }
    }

    function onSync() {
      setPinnedSet(new Set(readPinnedProjectIds()));
    }

    window.addEventListener(PINNED_PROJECTS_EVENT, onSync);
    window.addEventListener("storage", onSync);

    return () => {
      window.removeEventListener(PINNED_PROJECTS_EVENT, onSync);
      window.removeEventListener("storage", onSync);
    };
  }, [initialPinnedIds]);

  const isPinned = useCallback(
    (projectId: string): boolean => {
      return pinnedSet.has(projectId);
    },
    [pinnedSet],
  );

  const togglePin = useCallback(
    async (projectId: string) => {
      // Optimistically toggle locally first for instant UI response
      const nextState = toggleProjectPinnedLocally(projectId);
      setPinnedSet(new Set(readPinnedProjectIds()));

      // Then persist to server
      startTransition(async () => {
        try {
          const res = await togglePinTalentProjectAction({
            requestId: projectId,
            pinned: nextState,
          });
          if (!res.ok) {
            // Revert on error
            setProjectPinnedLocally(projectId, !nextState);
            setPinnedSet(new Set(readPinnedProjectIds()));
          }
        } catch {
          // Revert on network failure
          setProjectPinnedLocally(projectId, !nextState);
          setPinnedSet(new Set(readPinnedProjectIds()));
        }
      });
    },
    [],
  );

  return {
    pinnedSet,
    isPinned,
    togglePin,
  };
}
