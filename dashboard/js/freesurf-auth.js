/**
 * FreeSurf Shared Auth — cross-domain session utility.
 * Depends on: freesurf.config.js for domain/brand values.
 */

import config from "./freesurf.config.js";

const { SUPABASE_URL, SUPABASE_ANON_KEY, COOKIE_NAME, COOKIE_MAX_AGE } = config.AUTH;
const COOKIE_DOMAIN = config.COOKIE_DOMAIN;

let _supabasePromise = null;

function getSupabase() {
  if (!_supabasePromise) {
    _supabasePromise = import("https://esm.sh/@supabase/supabase-js@2").then(
      ({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: true, autoRefreshToken: true },
        })
    );
  }
  return _supabasePromise;
}

function setCookie(name, value, days) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};domain=${COOKIE_DOMAIN};path=/;SameSite=Lax`;
}

function getCookie(name) {
  const prefix = `${name}=`;
  for (const cookie of document.cookie.split(";")) {
    const c = cookie.trim();
    if (c.startsWith(prefix)) return decodeURIComponent(c.slice(prefix.length));
  }
  return null;
}

function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;domain=${COOKIE_DOMAIN};path=/;SameSite=Lax`;
}

export async function getSharedSession() {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) {
      persistToCookie(data.session.access_token);
      return { user: data.session.user, accessToken: data.session.access_token };
    }
    const cookieToken = getCookie(COOKIE_NAME);
    if (cookieToken) {
      const { data: restored } = await supabase.auth.setSession({ access_token: cookieToken, refresh_token: "" });
      if (restored.session?.user) {
        persistToCookie(restored.session.access_token);
        return { user: restored.session.user, accessToken: restored.session.access_token };
      }
      deleteCookie(COOKIE_NAME);
    }
    return null;
  } catch {
    return null;
  }
}

export async function setSharedSession() {
  try {
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) persistToCookie(data.session.access_token);
  } catch { /* localStorage still works */ }
}

export async function clearSharedSession() {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut();
  } catch { /* continue */ }
  deleteCookie(COOKIE_NAME);
}

function persistToCookie(accessToken) {
  setCookie(COOKIE_NAME, accessToken, 30);
}
