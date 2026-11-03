export interface Category {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  order?: number;
}

/** Une « rubrique » : quelque chose qui revient (Ramonage, Taille glycine, Première baignade…) */
export interface HouseEvent {
  id: string;
  categoryId: string;
  name: string;
  order?: number;
  note?: string;
}

/** Un événement daté rattaché à une rubrique. */
export interface Occurrence {
  id: string;
  eventId: string;
  year: number;
  /** Date précise (AAAA-MM-JJ) */
  date?: string;
  /** Fin de période (AAAA-MM-JJ) */
  endDate?: string;
  /** Date approximative en texte libre (« mi-octobre », « juillet - août »…) */
  label?: string;
  note?: string;
}

export interface Purchase {
  id: string;
  date?: string;
  amount?: number;
  item: string;
  note?: string;
}

export interface Attachment {
  id: string;
  ownerType: 'occurrences' | 'purchases';
  ownerId: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
  hasThumb?: boolean;
}

export interface Db {
  categories: Category[];
  events: HouseEvent[];
  occurrences: Occurrence[];
  purchases: Purchase[];
  attachments: Attachment[];
}

export type Collection = keyof Db;
