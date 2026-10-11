/** A compact, link-shareable evacuation route. It travels inside the URL, so the route page needs no backend and works from a Telegram message. */
export type SharedRoute = {
  v: string            // village
  d?: string           // district
  lvl: string          // risk level
  when: string         // impact window text
  at: string           // ISO time the route was issued
  from: [number, number] // lat, lng
  to: [number, number]   // lat, lng of the shelter
  shelter: string
  km: number
  path: [number, number][] // [lng, lat] waypoints, simplified
  ex?: boolean         // exercise
}

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))))

/** Keep at most `max` waypoints, always including both ends. */
export function simplify(path: [number, number][], max = 40): [number, number][] {
  if (path.length <= max) return path.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5])
  const out: [number, number][] = []
  for (let i = 0; i < max; i++) {
    const p = path[Math.round((i * (path.length - 1)) / (max - 1))]
    out.push([Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5])
  }
  return out
}

export const encodeRoute = (r: SharedRoute) => b64(JSON.stringify(r))
export function decodeRoute(s: string | null): SharedRoute | null {
  if (!s) return null
  try {
    const r = JSON.parse(unb64(s)) as SharedRoute
    const ok = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n))
    if (typeof r.v !== 'string' || typeof r.shelter !== 'string' || !ok(r.from) || !ok(r.to) || !Array.isArray(r.path) || r.path.length < 2 || !r.path.every(ok)) return null
    return r
  } catch { return null }
}
export const routeLink = (r: SharedRoute) => `${location.origin}/route?d=${encodeRoute(r)}`
export const mapsLink = (r: SharedRoute) => `https://www.google.com/maps/dir/?api=1&origin=${r.from[0]},${r.from[1]}&destination=${r.to[0]},${r.to[1]}&travelmode=walking`
export const whatsappShareUrl = (link: string, text: string) => `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`
export const telegramShareUrl = (link: string, text: string) => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`

export function shareText(r: SharedRoute) {
  const tag = r.ex ? 'अभ्यास / EXERCISE (not a real alert)\n' : ''
  return `${tag}JalNetra · ${r.v}${r.d ? ', ' + r.d : ''}\nजोखिम / Risk: ${r.lvl}${r.when ? ' · ' + r.when : ''}\nसुरक्षित स्थान / Safe place: ${r.shelter} (${r.km.toFixed(1)} km)\nमार्ग देखें (AR) / Open the route:`
}

// ---- geometry for the AR view ----
const R = 6371000, rad = (d: number) => (d * Math.PI) / 180
export const metres = (a: [number, number], b: [number, number]) => {  // [lat, lng]
  const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const bearing = (a: [number, number], b: [number, number]) => {
  const y = Math.sin(rad(b[1] - a[1])) * Math.cos(rad(b[0]))
  const x = Math.cos(rad(a[0])) * Math.sin(rad(b[0])) - Math.sin(rad(a[0])) * Math.cos(rad(b[0])) * Math.cos(rad(b[1] - a[1]))
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}
