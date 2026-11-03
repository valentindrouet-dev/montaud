import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import type { Attachment, Collection, Db } from './types';

type Item = { id: string; order?: number };

/** Vignette JPEG (côté navigateur) pour afficher vite les photos. */
async function makeThumb(file: File, size = 640): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } catch {
    return null; // format non lisible par le navigateur (ex. HEIC) : on garde l'original
  }
}

export function useDb(enabled = true) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    api.load().then(setDb, (e) => setError(e.message));
    // Changements faits par quelqu'un d'autre (stockage partagé)
    const off = api.subscribe?.((fresh) => setDb(fresh));
    // Au retour sur l'onglet / l'app (le direct peut se couper en arrière-plan sur mobile)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && api.kind === 'remote') api.load().then(setDb, () => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      off?.();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const run = useCallback(async <T,>(p: Promise<T>): Promise<T | undefined> => {
    try {
      setError(null);
      return await p;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  }, []);

  const reload = useCallback(async () => {
    const fresh = await run(api.load());
    if (fresh) setDb(fresh);
  }, [run]);

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
      await reload(); // le serveur supprime en cascade
    },
    [run, reload],
  );

  const upload = useCallback(
    async (ownerType: Attachment['ownerType'], ownerId: string, files: File[]) => {
      for (const file of files) {
        let item = await run(api.upload(ownerType, ownerId, file));
        if (!item) continue;
        if (file.type.startsWith('image/')) {
          const thumb = await makeThumb(file);
          if (thumb) item = (await run(api.uploadThumb(item.id, thumb))) ?? item;
        }
        const added = item;
        setDb((d) => d && { ...d, attachments: [...d.attachments.filter((a) => a.id !== added.id), added] });
      }
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

  return { db, setDb, error, setError, toast, setToast, create, update, remove, upload, move, run, reload };
}

export type DbActions = ReturnType<typeof useDb>;
