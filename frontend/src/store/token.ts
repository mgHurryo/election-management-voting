export const TOKEN_STORAGE_KEY = 'election.access_token'
// ADR-009: persist only the access token, never credentials or ballot choices.
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_STORAGE_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_STORAGE_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_STORAGE_KEY),
}
export const SESSION_EXPIRED = 'election:session-expired'
