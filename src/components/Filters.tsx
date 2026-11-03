import { Search, X } from 'lucide-react';
import { useApp } from '../context';
import { byOrder, catColor } from '../model';

export function SearchBox({ placeholder = 'Rechercher…' }: { placeholder?: string }) {
  const { query, setQuery } = useApp();
  return (
    <label className="search">
      <Search size={16} />
      <input type="search" placeholder={placeholder} value={query} onChange={(e) => setQuery(e.target.value)} />
      {query && (
        <button className="icon-btn" onClick={() => setQuery('')} aria-label="Effacer">
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function CategoryChips() {
  const { db, cats, toggleCat, clearCats } = useApp();
  return (
    <div className="chip-row" role="group" aria-label="Filtrer par catégorie">
      <button className={`chip selectable ${cats.size === 0 ? 'on' : ''}`} onClick={clearCats}>
        Tout
      </button>
      {[...db.categories].sort(byOrder).map((c) => (
        <button
          key={c.id}
          className={`chip selectable ${cats.has(c.id) ? 'on' : ''}`}
          style={{ '--c': catColor(c) } as React.CSSProperties}
          onClick={() => toggleCat(c.id)}
          aria-pressed={cats.has(c.id)}
        >
          <span aria-hidden>{c.icon}</span> {c.name}
        </button>
      ))}
    </div>
  );
}
