import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/** Panneau latéral (ordinateur) / feuille plein écran (mobile). */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  variant = 'side',
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'side' | 'center';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet sheet-${variant}`}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => e.target === ref.current && onClose()}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <X size={20} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}
