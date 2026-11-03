export interface Category {
  id: string;
  name: string;
  color?: string;
  order?: number;
  collapsed?: boolean;
}

export interface HouseEvent {
  id: string;
  categoryId: string;
  name: string;
  order?: number;
  note?: string;
}

/** Une « case » du tableau : un événement à une année donnée. */
export interface Occurrence {
  id: string;
  eventId: string;
  year: number;
  /** Date précise (AAAA-MM-JJ) */
  date?: string;
  /** Fin de période (AAAA-MM-JJ) */
  endDate?: string;
  /** Texte libre quand il n'y a pas de date précise (« mi-octobre », « juillet - août »…) */
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

export interface Db {
  categories: Category[];
  events: HouseEvent[];
  occurrences: Occurrence[];
  purchases: Purchase[];
}

export type Collection = keyof Db;
