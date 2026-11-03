// Branchement Supabase : table `items` + stockage `files` + connexion par e-mail.
// Activé quand VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont définis à la compilation.
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import type { RemoteStore, Row } from './remote';

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const BUCKET = 'files';
const PAGE = 1000;

export const sb: SupabaseClient | null =
  URL_ && KEY
    ? createClient(URL_, KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
      })
    : null;

function fail(error: { message: string } | null | undefined): void {
  if (!error) return;
  const m = error.message || 'Erreur réseau';
  if (/row-level security|permission denied|not authorized|Unauthorized/i.test(m)) {
    throw new Error('Accès refusé : cette adresse e-mail n’est pas autorisée sur Montaud.');
  }
  throw new Error(m);
}

export function supabaseStore(client: SupabaseClient): RemoteStore {
  const files = () => client.storage.from(BUCKET);
  return {
    async selectAll() {
      const out: Row[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await client.from('items').select('id,collection,data').order('id').range(from, from + PAGE - 1);
        fail(error);
        out.push(...((data ?? []) as Row[]));
        if (!data || data.length < PAGE) return out;
      }
    },
    async upsert(rows) {
      const { error } = await client.from('items').upsert(rows);
      fail(error);
    },
    async remove(ids) {
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await client.from('items').delete().in('id', ids.slice(i, i + 100));
        fail(error);
      }
    },
    async removeAll() {
      const { error } = await client.from('items').delete().not('id', 'is', null);
      fail(error);
    },
    async putFile(path, blob, contentType) {
      const { error } = await files().upload(path, blob, { contentType: contentType || 'application/octet-stream', upsert: true });
      fail(error);
    },
    async getFile(path) {
      const { data, error } = await files().download(path);
      fail(error);
      return data as Blob;
    },
    async removeFiles(paths) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await files().remove(paths.slice(i, i + 100));
        fail(error);
      }
    },
    async listFiles() {
      const out: string[] = [];
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await files().list('', { limit: PAGE, offset });
        fail(error);
        out.push(...(data ?? []).filter((f) => f.id).map((f) => f.name));
        if (!data || data.length < PAGE) return out;
      }
    },
    onChange(cb) {
      const channel = client
        .channel('montaud-items')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, () => cb())
        .subscribe();
      return () => {
        client.removeChannel(channel);
      };
    },
  };
}

/** Connexion par lien magique (ou code à 6 chiffres) envoyé par e-mail. */
export const auth = {
  enabled: Boolean(sb),
  async session(): Promise<Session | null> {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onChange(cb: (s: Session | null) => void) {
    if (!sb) return () => {};
    const { data } = sb.auth.onAuthStateChange((_e, s) => cb(s));
    return () => data.subscription.unsubscribe();
  },
  async sendLink(email: string) {
    const { error } = await sb!.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}${location.pathname}` },
    });
    if (error) throw new Error(error.message);
  },
  async verifyCode(email: string, token: string) {
    const { error } = await sb!.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error(error.message.includes('expired') ? 'Code expiré ou invalide' : error.message);
  },
  async isMember(): Promise<boolean> {
    const { data, error } = await sb!.rpc('is_member');
    if (error) throw new Error(error.message);
    return Boolean(data);
  },
  async signOut() {
    await sb?.auth.signOut();
  },
};
