import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Collection, Db } from './types';

type Item = { id: string; order?: number };

export function useDb() {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.load().then(setDb, (e) => setError(e.message));
  }, []);

  const run = useCallback(async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try {
      setError(null);
      return await p;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  }, []);

  const create = useCallback(
    async <T extends Item>(c: Collection, data: Partial<T>) => {
      const item = await run(api.create<T>(c, data));
      if (item) setDb((d) => d && { ...d, [c]: [...d[c], item] });
      return item;
    },
    [run],
  );

  const update = useCallback(
    async <T extends Item>(c: Collection, id: string, data: Partial<T>) => {
      const item = await run(api.update<T>(c, id, data));
      if (item) setDb((d) => d && { ...d, [c]: (d[c] as Item[]).map((x) => (x.id === id ? item : x)) });
      return item;
    },
    [run],
  );

  const remove = useCallback(
    async (c: Collection, id: string) => {
      await run(api.remove(c, id));
      // Le serveur supprime en cascade : on recharge pour rester synchronisé.
      const fresh = await run(api.load());
      if (fresh) setDb(fresh);
    },
    [run],
  );

  /** Déplace un élément d'un cran dans une liste ordonnée. */
  const move = useCallback(
    async (c: Collection, ordered: Item[], id: string, dir: -1 | 1) => {
      const idx = ordered.findIndex((x) => x.id === id);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= ordered.length) return;
      const next = [...ordered];
      [next[idx], next[target]] = [next[target], next[idx]];
      await Promise.all(next.map((x, i) => (x.order !== i ? update(c, x.id, { order: i } as Partial<Item>) : null)));
    },
    [update],
  );

  return { db, setDb, error, setError, create, update, remove, move, run };
}

export type DbActions = ReturnType<typeof useDb>;

export const byOrder = <T extends { order?: number }>(a: T, b: T) => (a.order ?? 0) - (b.order ?? 0);
