import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const missingVariables = [
  !supabaseUrl?.trim() ? "VITE_SUPABASE_URL" : "",
  !supabaseAnonKey?.trim() ? "VITE_SUPABASE_ANON_KEY" : "",
].filter(Boolean);

let urlIsValid = true;
if (supabaseUrl?.trim()) {
  try {
    const parsedUrl = new URL(supabaseUrl);
    urlIsValid = parsedUrl.protocol === "https:" || parsedUrl.protocol === "http:";
  } catch {
    urlIsValid = false;
  }
}

export const supabaseConfigError = missingVariables.length
  ? `Missing required frontend settings: ${missingVariables.join(", ")}.`
  : !urlIsValid
    ? "VITE_SUPABASE_URL must be a valid HTTP(S) URL."
    : null;

export const isSupabaseConfigured = supabaseConfigError === null;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
