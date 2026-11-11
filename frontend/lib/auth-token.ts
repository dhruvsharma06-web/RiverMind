/** Session token storage (sessionStorage) shared by the API client and AuthProvider. */
export const SESSION_KEY = "rivermind:session";
const listeners = new Set<() => void>();
let memory = "";
function store(): Storage | undefined {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : undefined;
  } catch {
    return undefined;
  }
}
export function getSessionToken(): string {
  try {
    return store()?.getItem(SESSION_KEY) ?? memory;
  } catch {
    return memory;
  }
}
export function setSessionToken(token: string) {
  memory = token;
  try {
    if (token) store()?.setItem(SESSION_KEY, token);
    else store()?.removeItem(SESSION_KEY);
  } catch {
    /* Memory-only session. */
  }
  listeners.forEach((l) => l());
}
export const clearSessionToken = () => setSessionToken("");
export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Only same-site absolute paths are valid post-login destinations. */
export function safeNext(
  value: string | null | undefined,
  fallback = "/river",
) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  if (/[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    if (
      new URL(value, "http://rivermind.local").origin !==
      "http://rivermind.local"
    )
      return fallback;
  } catch {
    return fallback;
  }
  return value;
}
