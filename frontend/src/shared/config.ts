const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '')
// Keep configuration public; VITE_* variables are bundled into browser code.
export const config = {
  apiBase: base,
  requestTimeoutMs: 15000,
  timeZone: 'Asia/Hong_Kong',
} as const
