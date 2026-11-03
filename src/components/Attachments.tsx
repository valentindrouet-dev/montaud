import { useRef, useState } from 'react';
import { FileText, ImagePlus, Paperclip, Trash2, Download } from 'lucide-react';
import type { Attachment } from '../types';
import { FileImg, FileLink } from '../files';
import { isImage } from '../model';
import { fileSize } from '../format';
import { useApp } from '../context';

/** Vignettes compactes (cartes du fil, calendrier…). */
export function Thumbs({ files, caption, occurrenceId, max = 4 }: { files: Attachment[]; caption?: string; occurrenceId?: string; max?: number }) {
  const { openLightbox } = useApp();
  const images = files.filter(isImage);
  const docs = files.filter((f) => !isImage(f));
  if (!files.length) return null;
  const shown = images.slice(0, max);
  return (
    <div className="thumbs">
      {shown.length > 0 && (
        <div className={`thumb-strip n${Math.min(shown.length, 4)}`}>
          {shown.map((f, i) => (
            <button
              key={f.id}
              className="thumb"
              onClick={(e) => {
                e.stopPropagation();
                openLightbox(images.map((file) => ({ file, caption, occurrenceId })), i);
              }}
            >
              <FileImg file={f} thumb loading="lazy" />
              {i === shown.length - 1 && images.length > shown.length && (
                <span className="more">+{images.length - shown.length}</span>
              )}
            </button>
          ))}
        </div>
      )}
      {docs.length > 0 && (
        <div className="doc-pills">
          {docs.map((f) => (
            <FileLink key={f.id} file={f} className="doc-pill" onClick={(e) => e.stopPropagation()}>
              <FileText size={14} /> {f.name}
            </FileLink>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gestion complète des pièces jointes d'un élément (dans l'éditeur). */
export function AttachmentManager({
  files,
  pending,
  onAdd,
  onRemove,
  onRemovePending,
  caption,
}: {
  files: Attachment[];
  pending: File[];
  onAdd: (files: File[]) => void;
  onRemove: (a: Attachment) => void;
  onRemovePending: (f: File) => void;
  caption?: string;
}) {
  const { openLightbox } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const images = files.filter(isImage);

  return (
    <div className="attach">
      <div
        className={`dropzone ${over ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) onAdd([...e.dataTransfer.files]);
        }}
        onClick={() => input.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      >
        <ImagePlus size={22} />
        <span>
          <strong>Ajouter des photos ou documents</strong>
          <small>Glisser-déposer ou cliquer · factures, devis, notices, photos…</small>
        </span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) onAdd([...e.target.files]);
            e.target.value = '';
          }}
        />
      </div>

      {(files.length > 0 || pending.length > 0) && (
        <ul className="attach-list">
          {files.map((f) => (
            <li key={f.id}>
              {isImage(f) ? (
                <button
                  className="attach-preview"
                  onClick={() => openLightbox(images.map((file) => ({ file, caption })), images.indexOf(f))}
                >
                  <FileImg file={f} thumb alt="" loading="lazy" />
                </button>
              ) : (
                <FileLink file={f} className="attach-preview doc">
                  <FileText size={22} />
                </FileLink>
              )}
              <span className="attach-name">
                <FileLink file={f}>{f.name}</FileLink>
                <small>{fileSize(f.size)}</small>
              </span>
              <FileLink file={f} download className="icon-btn" aria-label="Télécharger" title="Télécharger">
                <Download size={16} />
              </FileLink>
              <button
                className="icon-btn danger"
                aria-label="Supprimer"
                title="Supprimer"
                onClick={() => confirm(`Supprimer « ${f.name} » ?`) && onRemove(f)}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
          {pending.map((f, i) => (
            <li key={`p${i}`} className="pending">
              <span className="attach-preview doc">
                <Paperclip size={20} />
              </span>
              <span className="attach-name">
                {f.name}
                <small>{fileSize(f.size)} · envoyé à l’enregistrement</small>
              </span>
              <button className="icon-btn danger" aria-label="Retirer" onClick={() => onRemovePending(f)}>
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
