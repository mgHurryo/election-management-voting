const key = 'election.access_token'
// ADR-009: persist only the access token, never credentials or ballot choices.
export const tokenStore = {
  get: () => localStorage.getItem(key),
  set: (token: string) => localStorage.setItem(key, token),
  clear: () => localStorage.removeItem(key),
}
export const SESSION_EXPIRED = 'election:session-expired'
