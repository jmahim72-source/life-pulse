import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY). ' +
    'The app will work offline-only until these are configured.'
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

/** Sign in with magic link (email only, no password) */
export async function signInWithMagicLink(email: string) {
  if (!supabase) throw new Error('Supabase not configured');
  const { error } = await supabase.auth.signInWithOtp({ email });
  if (error) throw error;
}

/** Sign out and return success */
export async function signOut() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/** Get current session (null if not logged in) */
export async function getSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/** Get current user ID or null */
export async function getUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}
