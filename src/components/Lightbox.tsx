import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X } from 'lucide-react';
import type { Attachment } from '../types';
import { fileUrl } from '../api';

export interface LightboxItem {
  file: Attachment;
  caption?: string;
  occurrenceId?: string;
}

export function Lightbox({
  items,
  start,
  onClose,
  onOpenEntry,
}: {
  items: LightboxItem[];
  start: number;
  onClose: () => void;
  onOpenEntry?: (id: string) => void;
}) {
  const [i, setI] = useState(start);
  const item = items[i];
  const go = (d: number) => setI((x) => (x + d + items.length) % items.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Glisser du doigt pour changer de photo
  const [touchX, setTouchX] = useState<number | null>(null);

  if (!item) return null;
  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        setTouchX(null);
      }}
    >
      <div className="lb-top" onClick={(e) => e.stopPropagation()}>
        <span className="lb-count">
          {i + 1} / {items.length}
        </span>
        <span className="spacer" />
        {item.occurrenceId && onOpenEntry && (
          <button className="lb-btn" onClick={() => onOpenEntry(item.occurrenceId!)} title="Voir l’événement">
            <ExternalLink size={18} />
          </button>
        )}
        <a className="lb-btn" href={`${fileUrl(item.file)}?download`} title="Télécharger">
          <Download size={18} />
        </a>
        <button className="lb-btn" onClick={onClose} aria-label="Fermer">
          <X size={20} />
        </button>
      </div>
      <img key={item.file.id} src={fileUrl(item.file)} alt={item.file.name} onClick={(e) => e.stopPropagation()} />
      {items.length > 1 && (
        <>
          <button className="lb-nav prev" onClick={(e) => (e.stopPropagation(), go(-1))} aria-label="Précédente">
            <ChevronLeft size={28} />
          </button>
          <button className="lb-nav next" onClick={(e) => (e.stopPropagation(), go(1))} aria-label="Suivante">
            <ChevronRight size={28} />
          </button>
        </>
      )}
      {item.caption && <div className="lb-caption">{item.caption}</div>}
    </div>
  );
}
