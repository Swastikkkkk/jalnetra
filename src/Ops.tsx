import { useEffect, useMemo, useState } from 'react'
import { FiAlertTriangle, FiRefreshCw, FiArrowLeft, FiClock, FiPhoneCall, FiVolume2, FiCopy, FiPlus } from 'react-icons/fi'
import { ACTION_LABEL, nextFor, ROLE_LABEL, STATUS_LABEL, TYPE_LABEL, addContact, escalationDraft, getIncident, hasKey, hindiMessage, listAlerts, getTelephony, alertContext, type Telephony, listContacts, listIncidents, saveKey, sendAlerts, setStatus, type Alert, type Contact, type Event, type Incident, type Status } from './ops'

const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000)
  return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`
}
const slaText = (i: Incident) => {
  if (!i.sla_due || ['verified', 'rejected', 'resolved'].includes(i.status)) return null
  const h = (Date.parse(i.sla_due) - Date.now()) / 3600e3
  return h < 0 ? `SLA missed by ${Math.abs(h).toFixed(0)} h` : `${h.toFixed(0)} h left on SLA`
}
const OPEN: Status[] = ['detected', 'analyzing', 'alert_created', 'approved', 'contacted', 'evacuating', 'ticketed', 'reopened', 'escalated', 'fixed_claimed']

export function useIncidents() {
  const [items, setItems] = useState<Incident[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const load = async () => {
    setLoading(true)
    try { setItems(await listIncidents()); setErr(null) } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [])
  return { items, err, loading, load, setItems }
}

export default function OpsPanel({ inc, selId, onSelect, onBack }: { inc: ReturnType<typeof useIncidents>; selId: string | null; onSelect: (i: Incident | null) => void; onBack: () => void }) {
  const [filter, setFilter] = useState<'open' | 'all' | 'overdue'>('open')
  const [detail, setDetail] = useState<{ incident: Incident; events: Event[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [actErr, setActErr] = useState<string | null>(null)
  const shown = useMemo(() => inc.items.filter(i => filter === 'all' ? true : filter === 'overdue' ? i.overdue : OPEN.includes(i.status)), [inc.items, filter])
  const counts = useMemo(() => ({ open: inc.items.filter(i => OPEN.includes(i.status)).length, overdue: inc.items.filter(i => i.overdue).length, all: inc.items.length }), [inc.items])

  useEffect(() => { if (!selId) { setDetail(null); return } getIncident(selId).then(setDetail).catch(e => setActErr(e.message)) }, [selId])
  const act = async (s: Status) => {
    if (!detail) return
    setBusy(true); setActErr(null)
    try {
      await setStatus(detail.incident.id, s, note || undefined); setNote('')
      setDetail(await getIncident(detail.incident.id)); inc.load()
    } catch (e) { setActErr((e as Error).message) } finally { setBusy(false) }
  }

  const [keyIn, setKeyIn] = useState('')
  if (!hasKey()) return (
    <aside className="panel"><section>
      <div className="kicker">Operations</div><div className="h">Connect the dashboard</div>
      <p className="note">Paste the operator key from TEAM_KEYS.txt. It stays in this browser only.</p>
      <input id="ops-key" className="note-in" placeholder="jn_..." value={keyIn} onChange={e => setKeyIn(e.target.value)} />
      <div className="acts"><button disabled={!keyIn.trim()} onClick={() => { saveKey(keyIn); inc.load() }}>Connect</button><button className="ghost" onClick={onBack}><FiArrowLeft /> Back to map</button></div>
    </section></aside>
  )

  if (detail) {
    const i = detail.incident, sla = slaText(i)
    return (
      <aside className="panel">
        <section>
          <button className="link back" onClick={() => onSelect(null)}><FiArrowLeft /> All incidents</button>
          <div className="kicker">{TYPE_LABEL[i.incident_type]} · {i.severity} severity · {i.source}</div>
          <div className="h">{i.title ?? `${TYPE_LABEL[i.incident_type]} report`}</div>
          <div className="pills"><span className={'pill st-' + i.status}>{STATUS_LABEL[i.status]}</span>{sla && <span className={'pill ' + (i.overdue ? 'atrisk' : 'safe')}><FiClock /> {sla}</span>}</div>
          <dl className="kv">
            <dt>Observed</dt><dd>{new Date(i.observed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} IST</dd>
            <dt>Location</dt><dd>{i.lat.toFixed(4)}, {i.lng.toFixed(4)}</dd>
            <dt>Reports</dt><dd>{i.reports} · first from {i.reported_by}</dd>
            <dt>Confidence</dt><dd>{Math.round(i.confidence * 100)}%</dd>
            {i.details?.districts?.length > 0 && <><dt>Districts</dt><dd>{i.details.districts.join(', ')}</dd></>}
            {i.details?.villages?.length > 0 && <><dt>Villages</dt><dd>{i.details.villages.slice(0, 12).join(', ')}{i.details.villages.length > 12 ? ` and ${i.details.villages.length - 12} more` : ''}</dd></>}
          </dl>
          {i.details?.prediction && <div className="predbox">
            <div className="kicker mt">Why this alert was created</div>
            <div className="pills"><span className={'pill lv-' + i.details.prediction.level}>{i.details.prediction.level}</span><span className="pill safe">{Math.round(i.details.prediction.p * 100)}% flood probability</span>{i.details.prediction.impactH !== null && <span className="pill safe">impact {i.details.prediction.impactH === 0 ? 'now' : `~${i.details.prediction.impactH} h`}</span>}{i.details.simulated && <span className="pill sim">Simulation</span>}</div>
            <ul className="reasons">{(i.details.prediction.factors ?? []).filter((f: any) => f.pts >= 3).map((f: any) => <li key={f.label}><b>{f.label}</b>: {f.detail}</li>)}</ul>
            {i.details.route && <p className="note">Evacuation: {i.details.route}</p>}
          </div>}
          {nextFor(i).length > 0 && (
            <>
              <div className="kicker mt">Next action</div>
              <input id="ops-note" className="note-in" placeholder="Note for the record (optional)" value={note} onChange={e => setNote(e.target.value)} />
              <div className="acts">{nextFor(i).map(s => <button key={s} disabled={busy} className={s === 'rejected' || s === 'reopened' || s === 'escalated' ? 'ghost' : ''} onClick={() => act(s)}>{ACTION_LABEL[s]}</button>)}</div>
            </>
          )}
          {actErr && <p className="err">{actErr}</p>}
          <WarnBlock i={i} />
          {i.overdue && <Escalation i={i} />}
          <div className="kicker mt">History</div>
          <ol className="tl">{detail.events.map(e => <li key={e.id}><b>{STATUS_LABEL[e.action as Status] ?? ({ evidence: 'Evidence', alert: 'Warning sent', duplicate_report: 'Another report', prediction_update: 'Prediction updated' } as Record<string, string>)[e.action] ?? e.action.replace('_', ' ')}</b> · {e.actor} · {ago(e.created_at)}{e.note ? <div className="tlnote">{e.note}</div> : null}</li>)}</ol>
        </section>
      </aside>
    )
  }

  return (
    <aside className="panel">
      <section>
        <div className="vhead"><div><div className="kicker">Operations · live from the shared API</div><div className="h">Incidents</div></div>
          <button className="x" onClick={inc.load} aria-label="Refresh"><FiRefreshCw className={inc.loading ? 'spin' : ''} /></button></div>
        <div className="seg sm">{(['open', 'overdue', 'all'] as const).map(f => <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f === 'open' ? `Open ${counts.open}` : f === 'overdue' ? `Overdue ${counts.overdue}` : `All ${counts.all}`}</button>)}</div>
        {inc.err && <p className="err"><FiAlertTriangle /> {inc.err}</p>}
        <ul className="ilist">
          {shown.map(i => (
            <li key={i.id}><button onClick={() => onSelect(i)}>
              <span className={'dot sev-' + i.severity} />
              <span className="it"><span className="ititle">{i.title ?? TYPE_LABEL[i.incident_type]}</span>
                <span className="imeta">{TYPE_LABEL[i.incident_type]} · {STATUS_LABEL[i.status]} · {ago(i.created_at)}{i.overdue ? ' · SLA missed' : ''}</span></span>
            </button></li>
          ))}
          {shown.length === 0 && !inc.err && <li className="empty">No incidents in this view.</li>}
        </ul>
        <button className="link" onClick={onBack}><FiArrowLeft /> Back to the flood map</button>
      </section>
    </aside>
  )
}

function WarnBlock({ i }: { i: Incident }) {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [msg, setMsg] = useState(hindiMessage(i))
  const [channel, setChannel] = useState<'call' | 'sms'>('call')
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [res, setRes] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tel, setTel] = useState<Telephony | null>(null)
  const [demo, setDemo] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', role: 'sarpanch' as Contact['role'], phone: '+91', place_name: (i.details?.villages ?? [])[0] ?? '' })
  const load = () => { listContacts(i.lat, i.lng, 25).then(setContacts).catch(() => {}); listAlerts(i.id).then(setAlerts).catch(() => {}) }
  useEffect(() => { setMsg(hindiMessage(i)); setPicked([]); setRes(null); load() }, [i.id])
  useEffect(() => { getTelephony().then(setTel).catch(() => {}) }, [])
  const send = async () => {
    setBusy(true); setRes(null)
    try {
      const r = await sendAlerts(i.id, picked, msg, channel, { demo: demo && channel === 'call', context: alertContext(i) })
      const via = r.telephony === 'omnidimension' ? 'Hindi AI call placed via OmniDimension' : r.telephony === 'twilio' ? 'Sent via Twilio' : 'Logged only, no phone provider connected'
      setRes(`${via}. ` + r.results.map(x => `${x.contact}: ${x.status === 'sent' ? 'ringing now' : x.status}${x.error ? ` (${x.error})` : ''}`).join(' · '))
      load()
    } catch (e) { setRes((e as Error).message) } finally { setBusy(false) }
  }
  const save = async () => {
    setBusy(true); setRes(null)
    try { await addContact({ ...form, district: (i.details?.districts ?? [])[0] ?? null, lat: i.lat, lng: i.lng, language: 'hi' } as any); setAdding(false); setForm({ ...form, name: '', phone: '+91' }); load() } catch (e) { setRes((e as Error).message) } finally { setBusy(false) }
  }
  const preview = () => { try { const u = new SpeechSynthesisUtterance(msg); u.lang = 'hi-IN'; speechSynthesis.cancel(); speechSynthesis.speak(u) } catch { /* no speech */ } }
  return (
    <>
      <div className="kicker mt">Warn people nearby</div>
      {contacts.length === 0 ? <p className="note">No contacts within 25 km yet. Add the sarpanch, ASHA worker or NGO for this area.</p> : (
        <ul className="clist">{contacts.map(c => (
          <li key={c.id}><label><input type="checkbox" checked={picked.includes(c.id)} onChange={e => setPicked(p => e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id))} />
            <span><b>{c.name}</b> · {ROLE_LABEL[c.role]}, {c.place_name}<span className="imeta"> {c.phone} · {c.km?.toFixed(1)} km</span></span></label></li>
        ))}</ul>
      )}
      {adding ? (
        <div className="cform">
          <input id="c-name" className="note-in" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <select id="c-role" className="note-in" value={form.role} onChange={e => setForm({ ...form, role: e.target.value as Contact['role'] })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input id="c-phone" className="note-in" placeholder="+91XXXXXXXXXX" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
          <input id="c-place" className="note-in" placeholder="Village or place" value={form.place_name} onChange={e => setForm({ ...form, place_name: e.target.value })} />
          <div className="acts"><button disabled={busy || !form.name || form.phone.length < 10 || !form.place_name} onClick={save}>Save contact</button><button className="ghost" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      ) : <button className="link back" onClick={() => setAdding(true)}><FiPlus /> Add contact</button>}
      {tel?.demo_phone && <label className="demo-row"><input type="checkbox" checked={demo} onChange={e => setDemo(e.target.checked)} /> <span>Also call demo phone <span className="imeta">{tel.demo_phone}</span></span></label>}
      {tel && <p className="imeta">Voice calls: {tel.call === 'omnidimension' ? 'OmniDimension Hindi agent (can answer questions)' : tel.call === 'twilio' ? 'Twilio text to speech' : 'not connected'}</p>}
      <textarea id="warn-msg" className="note-in msg" rows={5} value={msg} onChange={e => setMsg(e.target.value)} />
      <div className="acts">
        <div className="seg sm inline">{(['call', 'sms'] as const).map(c => <button key={c} className={channel === c ? 'on' : ''} onClick={() => setChannel(c)}>{c === 'call' ? 'Voice call' : 'SMS'}</button>)}</div>
        <button className="ghost" onClick={preview}><FiVolume2 /> Preview</button>
        <button disabled={busy || (picked.length === 0 && !(demo && channel === 'call')) || !msg.trim()} onClick={send}><FiPhoneCall /> {busy ? 'Sending…' : `Send to ${picked.length + (demo && channel === 'call' ? 1 : 0) || 'selected'}`}</button>
      </div>
      {res && <p className="note">{res}</p>}
      {alerts.length > 0 && <ul className="tl">{alerts.slice(0, 6).map(a => <li key={a.id}><b>{a.channel === 'call' ? 'Call' : 'SMS'} · {a.status === 'sent' ? (a.call_status && a.call_status !== 'dispatched' ? a.call_status.replace('-', ' ') : 'ringing') : a.status === 'failed' ? 'failed' : 'logged, not connected'}</b> · {a.jn_contacts?.name ?? 'Demo phone'} · {new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
        {a.questions && a.questions.length > 0 && <div className="tlnote">Asked: {a.questions.join(' · ')}</div>}{a.summary && <div className="tlnote">{a.summary}</div>}</li>)}</ul>}
    </>
  )
}

function Escalation({ i }: { i: Incident }) {
  const [text, setText] = useState(escalationDraft(i))
  const [copied, setCopied] = useState(false)
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ } }
  return (
    <>
      <div className="kicker mt">Deadline missed · public escalation draft</div>
      <p className="note">Nothing is posted automatically. Check the facts, add the authority&apos;s handle, then copy.</p>
      <textarea id="esc-msg" className="note-in msg" rows={4} value={text} onChange={e => setText(e.target.value)} maxLength={280} />
      <div className="acts"><span className="imeta">{text.length}/280</span><button onClick={copy}><FiCopy /> {copied ? 'Copied' : 'Copy post'}</button></div>
    </>
  )
}
