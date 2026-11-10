const eventName = "rivermind:claims";
export function readClaim(id: string) {
  try {
    return sessionStorage.getItem(`claim:${id}`) ?? "";
  } catch {
    return "";
  }
}
export function saveClaim(id: string, token: string) {
  try {
    sessionStorage.setItem(`claim:${id}`, token);
    window.dispatchEvent(new Event(eventName));
    return true;
  } catch {
    return false;
  }
}
export function subscribeClaims(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener("storage", callback);
  };
}
