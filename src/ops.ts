// Client for the shared JalNetra incident API. The API contract stays the same when the backend moves to AWS.
export const API = (import.meta.env.VITE_JALNETRA_API as string | undefined) ?? 'https://oceaylrebzflgyxfjqfb.supabase.co/functions/v1/jalnetra-api'
const ENV_KEY = import.meta.env.VITE_JALNETRA_KEY as string | undefined
const getKey = () => { try { return ENV_KEY || localStorage.getItem('jn_key') || undefined } catch { return ENV_KEY } }
export const saveKey = (k: string) => { try { localStorage.setItem('jn_key', k.trim()) } catch { /* storage blocked */ } }

export type Status = 'detected' | 'approved' | 'rejected' | 'ticketed' | 'fixed_claimed' | 'verified' | 'reopened' | 'escalated'
export type Incident = {
  id: string; incident_type: 'river_flood' | 'waterlogging' | 'pothole' | 'leak'; severity: 'low' | 'medium' | 'high'; confidence: number
  lat: number; lng: number; observed_at: string; source: string; title: string | null; evidence_url: string | null; details: Record<string, any>
  status: Status; reports: number; reported_by: string; sla_due: string | null; created_at: string; updated_at: string; overdue: boolean
}
export type Event = { id: number; action: string; actor: string; note: string | null; created_at: string }

export const NEXT: Record<Status, Status[]> = {
  detected: ['approved', 'rejected'], approved: ['ticketed', 'rejected'], ticketed: ['fixed_claimed', 'escalated'],
  fixed_claimed: ['verified', 'reopened'], reopened: ['ticketed', 'escalated'], escalated: ['ticketed', 'fixed_claimed'], rejected: [], verified: [],
}
export const STATUS_LABEL: Record<Status, string> = {
  detected: 'Detected', approved: 'Approved', rejected: 'Rejected', ticketed: 'Ticket raised', fixed_claimed: 'Marked fixed', verified: 'Verified fixed', reopened: 'Reopened', escalated: 'Escalated',
}
export const ACTION_LABEL: Record<Status, string> = {
  detected: 'Detect', approved: 'Approve', rejected: 'Reject', ticketed: 'Raise ticket', fixed_claimed: 'Mark fixed', verified: 'Verify fix', reopened: 'Reopen', escalated: 'Escalate',
}
export const TYPE_LABEL = { river_flood: 'River flood', waterlogging: 'Waterlogging', pothole: 'Pothole', leak: 'Leak' } as const
export const hasKey = () => !!getKey()

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const KEY = getKey()
  if (!KEY) throw new Error('Add your operator key to connect the dashboard')
  const r = await fetch(API + path, { ...init, headers: { 'content-type': 'application/json', 'x-jalnetra-key': KEY, ...(init?.headers ?? {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error ? `${j.error}${j.allowed ? ` (allowed: ${j.allowed.join(', ')})` : ''}` : `Request failed (${r.status})`)
  return j as T
}
export const listIncidents = () => call<{ incidents: Incident[] }>('/incidents?limit=500').then(r => r.incidents)
export const getIncident = (id: string) => call<{ incident: Incident; events: Event[] }>(`/incidents/${id}`)
export const setStatus = (id: string, status: Status, note?: string) => call<{ incident: Incident }>(`/incidents/${id}`, { method: 'PATCH', body: JSON.stringify({ status, note }) })

export type Contact = { id: string; name: string; role: 'sarpanch' | 'asha' | 'ngo' | 'official' | 'volunteer'; phone: string; place_name: string; district: string | null; lat: number; lng: number; km?: number }
export type Alert = { id: string; channel: 'call' | 'sms'; message: string; status: 'sent' | 'failed' | 'not_configured'; error: string | null; created_at: string; jn_contacts: { name: string; role: string; phone: string; place_name: string } | null }
export const ROLE_LABEL = { sarpanch: 'Sarpanch', asha: 'ASHA worker', ngo: 'NGO', official: 'Official', volunteer: 'Volunteer' } as const
export const listContacts = (lat: number, lng: number, km = 20) => call<{ contacts: Contact[] }>(`/contacts?lat=${lat}&lng=${lng}&km=${km}`).then(r => r.contacts)
export const addContact = (c: Omit<Contact, 'id' | 'km'>) => call<{ contact: Contact }>('/contacts', { method: 'POST', body: JSON.stringify(c) }).then(r => r.contact)
export type Telephony = { call: 'omnidimension' | 'twilio' | 'not_configured'; demo_phone: string | null }
export type AlertContext = { place: string; title: string; source: string; observed: string; safe_place: string }
export const getTelephony = () => call<Telephony>('/telephony')
export const sendAlerts = (id: string, contact_ids: string[], message: string, channel: 'call' | 'sms', opts: { demo?: boolean; context?: AlertContext } = {}) =>
  call<{ telephony: Telephony['call']; results: { contact: string; phone: string; status: string; error: string | null }[] }>(`/incidents/${id}/alerts`, { method: 'POST', body: JSON.stringify({ contact_ids, message, channel, ...opts }) })
export function alertContext(i: Incident): AlertContext {
  return {
    place: [i.details?.reach, ...(i.details?.villages ?? []).slice(0, 3)].filter(Boolean).join(', ') || `${i.lat.toFixed(3)}, ${i.lng.toFixed(3)}`,
    title: i.title ?? TYPE_LABEL[i.incident_type], source: i.source,
    observed: new Date(i.observed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    safe_place: i.details?.safe_place ?? i.details?.shelter ?? 'nearest school or panchayat building on high ground',
  }
}
export const listAlerts = (id: string) => call<{ alerts: Alert[] }>(`/incidents/${id}/alerts`).then(r => r.alerts)

const HM = ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर']
export function hindiMessage(i: Incident) {
  const d = new Date(i.observed_at), when = `${d.getDate()} ${HM[d.getMonth()]}`
  const places = (i.details?.villages ?? []).slice(0, 3).join(', ')
  if (i.incident_type === 'river_flood') return `नमस्ते। यह जलनेत्र की बाढ़ चेतावनी है। ${when} को उपग्रह ने ${i.details?.reach ?? 'आपके इलाके'} के पास गंडक नदी का पानी गाँवों तक पहुँचते देखा${places ? `, जिनमें ${places} शामिल हैं` : ''}। कृपया बच्चों, बुज़ुर्गों और गर्भवती महिलाओं को सबसे पहले ऊँची सुरक्षित जगह ले जाएँ और पंचायत को सूचित करें।`
  if (i.incident_type === 'waterlogging') return `नमस्ते। यह जलनेत्र की चेतावनी है। आपके पास की सड़क पर गहरा जलभराव है। कृपया उस रास्ते से न जाएँ और बच्चों को पानी से दूर रखें।`
  if (i.incident_type === 'pothole') return `नमस्ते। यह जलनेत्र की सूचना है। आपके इलाके की सड़क पर गड्ढे की शिकायत दर्ज हुई है और मरम्मत के लिए टिकट बनाया गया है।`
  return `नमस्ते। यह जलनेत्र की सूचना है। आपके इलाके की पानी की पाइपलाइन में रिसाव का पता चला है। मरम्मत टीम को सूचित कर दिया गया है।`
}
export function escalationDraft(i: Incident) {
  const hrs = i.sla_due ? Math.max(0, Math.round((Date.now() - Date.parse(i.sla_due)) / 3600e3)) : 0
  const first = new Date(i.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return `${i.title ?? 'Reported issue'}. First flagged by JalNetra on ${first} (${i.source}, ${i.reports} report${i.reports > 1 ? 's' : ''}). Still open ${hrs} h past its deadline. Location ${i.lat.toFixed(4)}, ${i.lng.toFixed(4)}. [authority handle]`
}
