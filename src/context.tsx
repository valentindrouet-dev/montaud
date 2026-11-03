import { createContext, useContext } from 'react';
import type { Attachment, Db } from './types';
import type { DbActions } from './useDb';
import type { Entry } from './model';

export interface EditorPreset {
  date?: string;
  eventId?: string;
  year?: number;
}

export interface AppCtx {
  db: Db;
  actions: DbActions;
  entries: Entry[];
  /** filtres partagés entre les vues */
  query: string;
  setQuery: (q: string) => void;
  cats: Set<string>;
  toggleCat: (id: string) => void;
  clearCats: () => void;
  openEntry: (occurrenceId: string) => void;
  newEntry: (preset?: EditorPreset) => void;
  openLightbox: (items: { file: Attachment; caption?: string; occurrenceId?: string }[], index: number) => void;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp hors contexte');
  return ctx;
}
