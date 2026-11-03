import { useEffect, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react';
import { api } from './api';
import type { Attachment } from './types';

const cache = new Map<string, string>();

/** URL d'un fichier joint (résolue de façon asynchrone en mode navigateur). */
export function useFileUrl(a: Attachment | undefined, thumb = false): string | undefined {
  const key = a ? `${a.id}|${thumb && a.hasThumb ? 't' : 'f'}` : '';
  const [url, setUrl] = useState(() => cache.get(key));
  useEffect(() => {
    if (!a) return;
    const hit = cache.get(key);
    if (hit) return setUrl(hit);
    let alive = true;
    setUrl(undefined);
    api.fileUrl(a, thumb).then(
      (u) => {
        cache.set(key, u);
        if (alive) setUrl(u);
      },
      () => {},
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return url;
}

export function FileImg({ file, thumb = false, ...rest }: { file: Attachment; thumb?: boolean } & ImgHTMLAttributes<HTMLImageElement>) {
  const url = useFileUrl(file, thumb);
  return url ? <img src={url} alt={file.name} {...rest} /> : <span className="img-ph" aria-hidden />;
}

export function FileLink({
  file,
  download = false,
  children,
  ...rest
}: { file: Attachment; download?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const url = useFileUrl(file);
  return (
    <a href={url} download={download ? file.name : undefined} target={download ? undefined : '_blank'} rel="noreferrer" {...rest}>
      {children}
    </a>
  );
}

/** Déclenche le téléchargement d'un Blob. */
export function saveBlob(blob: Blob, name: string) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 10_000);
}
