import { supabase } from "../lib/supabase";
import { getAuthRedirectUrl } from "../lib/appUrls";

export type UserProfile = { full_name: string; avatar_url: string | null };

const requireClient = () => {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
};

export async function signIn(email: string, password: string) {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email: string, password: string, fullName: string, phone: string) {
  const cleanName = fullName.trim();
  const cleanPhone = phone.trim();
  if (cleanName.length < 2 || cleanName.length > 100) throw new Error("Full name must be between 2 and 100 characters.");
  if (!/^[+0-9 ()-]{7,32}$/.test(cleanPhone)) throw new Error("Enter a valid mobile number.");
  const { error } = await requireClient().auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      emailRedirectTo: await getAuthRedirectUrl("/workspace/create"),
      data: { full_name: cleanName, phone: cleanPhone },
    },
  });
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

export async function getUserProfile(): Promise<UserProfile | null> {
  const client = requireClient();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("The authenticated user could not be resolved.");
  const { data, error } = await client.from("profiles").select("full_name,avatar_url").eq("id", userData.user.id).maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function updateUserProfile(input: { fullName: string; avatarUrl: string }): Promise<UserProfile> {
  const fullName = input.fullName.trim();
  const avatarUrl = input.avatarUrl.trim();
  if (!fullName) throw new Error("Full name is required.");
  if (fullName.length > 100) throw new Error("Full name must be 100 characters or fewer.");
  if (avatarUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(avatarUrl);
    } catch {
      throw new Error("Profile photo must be a valid HTTPS URL.");
    }
    if (parsedUrl.protocol !== "https:") throw new Error("Profile photo must be a valid HTTPS URL.");
  }

  const { data, error } = await requireClient().rpc("update_own_profile", {
    target_full_name: fullName,
    target_avatar_url: avatarUrl || null,
  });
  if (error) throw error;
  if (!data) throw new Error("Profile was not returned after saving.");
  return data as UserProfile;
}

export async function requestPasswordReset(email: string) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email, {
    redirectTo: await getAuthRedirectUrl("/reset-password"),
  });
  if (error) throw error;
}
