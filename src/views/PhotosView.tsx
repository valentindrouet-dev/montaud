import { useMemo } from 'react';
import { ImageOff } from 'lucide-react';
import { useApp } from '../context';
import { isImage, matches } from '../model';
import { FileImg } from '../files';
import { whenText } from '../format';
import { CategoryChips, SearchBox } from '../components/Filters';

export function PhotosView() {
  const { entries, query, cats, openLightbox } = useApp();

  const photos = useMemo(
    () =>
      entries
        .filter((e) => matches(e, query, cats))
        .flatMap((e) =>
          e.files.filter(isImage).map((file) => ({
            file,
            year: e.occ.year,
            caption: `${e.category.icon} ${e.event.name} — ${whenText(e.occ, true)}`,
            occurrenceId: e.occ.id,
          })),
        ),
    [entries, query, cats],
  );

  const years = [...new Set(photos.map((p) => p.year))];

  return (
    <section className="view photos-view">
      <header className="view-head">
        <div>
          <h1>Photos</h1>
          <p className="muted">{photos.length} photos rattachées aux événements</p>
        </div>
        <SearchBox placeholder="Rechercher…" />
      </header>
      <CategoryChips />
      {photos.length === 0 && (
        <div className="empty-state">
          <ImageOff size={36} />
          <p>Pas encore de photos. Ouvre un événement et ajoute-en depuis « Photos & documents ».</p>
        </div>
      )}
      {years.map((y) => (
        <section key={y}>
          <h2 className="photo-year">{y}</h2>
          <div className="masonry">
            {photos
              .filter((p) => p.year === y)
              .map((p) => (
                <button key={p.file.id} className="masonry-item" onClick={() => openLightbox(photos, photos.indexOf(p))}>
                  <FileImg file={p.file} thumb alt={p.caption} loading="lazy" />
                  <span className="masonry-caption">{p.caption}</span>
                </button>
              ))}
          </div>
        </section>
      ))}
    </section>
  );
}
