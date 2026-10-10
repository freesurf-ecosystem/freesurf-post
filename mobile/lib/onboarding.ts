import { supabase } from "./supabase";

// Terms version recorded on acceptance. Keep in sync with the web dashboard.
export const TERMS_VERSION = "2026.09.17";

export type OnboardingState = {
  terms: boolean;   // Terms & Privacy accepted (blocking)
  digest: boolean;  // FeedFree Digest decision recorded (accepted or declined)
  updates: boolean; // FreeSurf product-updates decision recorded
};

export function onboardingComplete(s: OnboardingState): boolean {
  return s.terms && s.digest && s.updates;
}

// Reads the user's own consents rows (RLS: auth.uid() = user_id) and derives
// which of the three onboarding prompts have been answered.
export async function loadOnboardingState(userId: string): Promise<OnboardingState> {
  const state: OnboardingState = { terms: false, digest: false, updates: false };
  try {
    const { data, error } = await supabase.from("consents").select("type").eq("user_id", userId);
    if (error) { console.error("[onboarding] load failed:", error.message); return state; }
    for (const row of data || []) {
      if (row.type === "terms") state.terms = true;
      else if (row.type === "onboarding_digest") state.digest = true;
      else if (row.type === "onboarding_updates") state.updates = true;
    }
  } catch (e: any) {
    console.error("[onboarding] load threw:", e?.message || e);
  }
  return state;
}

export async function recordConsent(userId: string, type: string, version: string): Promise<void> {
  const { error } = await supabase.from("consents").insert({ user_id: userId, type, version });
  if (error) throw error;
}

// FreeSurf product updates — single opt-in (duplicate is a no-op).
export async function subscribeProductUpdates(email: string): Promise<void> {
  const { error } = await supabase.from("update_subscriptions").insert({
    email: email.trim().toLowerCase(),
    list: "ecosystem_updates",
    source: "post_onboarding",
  });
  if (error && error.code !== "23505") throw error;
}

// FeedFree Digest — same edge function the web login uses.
export async function subscribeDigest(email: string): Promise<void> {
  const { error } = await supabase.functions.invoke("feedfree-create-signup", {
    body: { email, topics: [] },
  });
  if (error) throw error;
}
