import { supabase } from "../lib/supabase";

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export async function signIn(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string) {
  const { error } = await requireClient().auth.signUp({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export async function updatePassword(password: string) {
  const { error } = await requireClient().auth.updateUser({ password });
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
}
