import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator, type MapViewState, type PickingInfo } from '@deck.gl/core'
import { GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { FiArrowLeft, FiHome, FiInfo, FiRefreshCw, FiX, FiActivity, FiPlayCircle } from 'react-icons/fi'
import { STATUS_ORDER, statusOf, summarise, villagesAtRisk, type PointStatus, type RiverPoint, type Status, type Village } from '../engine/india'
import { FONT, fmtIST, fmtQ } from './shared'

const RGB: Record<Status, [number, number, number]> = { NORMAL: [100, 116, 139], RISING: [253, 224, 71], WARNING: [245, 158, 11], DANGER: [251, 113, 133] }
const WORD: Record<Status, string> = { NORMAL: 'Normal', RISING: 'Rising fast', WARNING: 'High', DANGER: 'Above 2025 peak' }
const ARROW = { rising: '↑ rising', falling: '↓ falling', steady: '→ steady' } as const
const INITIAL: MapViewState = { longitude: 82.5, latitude: 23.2, zoom: 4.3, pitch: 0, bearing: 0, minZoom: 3.5, maxZoom: 12 }
const dayName = (k: number) => (k === 0 ? 'today' : k === 1 ? 'tomorrow' : `in ${k} days`)

type Data = { points: RiverPoint[]; lines: { river: string; path: number[][] }[] }
type Run = { at: number; date: string; statuses: PointStatus[]; source: 'live' | 'server' | 'replay'; alerts?: number }
const PUBLIC = 'https://oceaylrebzflgyxfjqfb.supabase.co/functions/v1/jalnetra-public'

/** Latest scan from the server worker (runs every 3 h), so every visitor does not hit GloFAS separately. */
async function serverRun(points: Map<number, RiverPoint>): Promise<Run | null> {
  const j = await fetch(PUBLIC).then(r => r.json()).catch(() => null)
  const R = j?.river
  if (!R || Date.now() - Date.parse(R.created_at) > 6 * 3600e3) return null
  const statuses: PointStatus[] = (R.statuses as [number, any, number, number, number, number | null, any][]).filter(s => points.has(s[0])).map(([id, status, now, peak, peakDay, crossDay, trend]) => ({ id, status, trend: trend ?? 'steady', now, peak, peakDay, crossDay, ratio: peak / Math.max(points.get(id)!.max, 1), series: [], days: [], today: 0 }))
  return { at: Date.parse(R.created_at), date: R.created_at.slice(0, 10), statuses, source: 'server', alerts: R.alerts_created }
}
async function pointSeries(p: RiverPoint): Promise<PointStatus | null> {
  const r = await fetch(`https://flood-api.open-meteo.com/v1/flood?latitude=${p.glat}&longitude=${p.glng}&daily=river_discharge&past_days=10&forecast_days=8`).then(x => (x.ok ? x.json() : null)).catch(() => null)
  return r ? statusOf(p, r.daily.time, r.daily.river_discharge, new Date().toISOString().slice(0, 10)) : null
}

async function liveRun(points: RiverPoint[]): Promise<Run> {
  const out: PointStatus[] = [], B = 90
  for (let i = 0; i < points.length; i += B) {
    const ch = points.slice(i, i + B)
    const u = `https://flood-api.open-meteo.com/v1/flood?latitude=${ch.map(p => p.glat).join(',')}&longitude=${ch.map(p => p.glng).join(',')}&daily=river_discharge&past_days=3&forecast_days=8`
    let j: any = null
    for (let k = 0; k < 3 && !j; k++) { const r = await fetch(u).catch(() => null); if (r?.ok) j = await r.json(); else await new Promise(res => setTimeout(res, 1500 * (k + 1))) }
    if (!j) throw new Error('GloFAS did not respond')
    const arr = Array.isArray(j) ? j : [j]
    arr.forEach((x: any, k: number) => { out.push(statusOf(ch[k], x.daily.time, x.daily.river_discharge, new Date().toISOString().slice(0, 10))) })
  }
  return { at: Date.now(), date: new Date().toISOString().slice(0, 10), statuses: out, source: 'live' }
}

export default function RiverWatch({ onHome, onGandak, onDemo }: { onHome: () => void; onGandak: () => void; onDemo: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [villages, setVillages] = useState<Village[] | null>(null)
  const [replay, setReplay] = useState<{ days: string[]; q: Record<string, (number | null)[]> } | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sel, setSel] = useState<number | null>(null)
  const [view, setView] = useState<MapViewState>(INITIAL)
  const [help, setHelp] = useState(false)
  const [date, setDate] = useState<string | null>(null) // replay date, null = live

  useEffect(() => { fetch('/india/rivers.json').then(r => r.json()).then(setData).catch(e => setErr('Could not load river list: ' + e)) }, [])
  const P = useMemo(() => new Map((data?.points ?? []).map(p => [p.id, p])), [data])
  const refresh = async () => {
    if (!data) return
    setBusy(true); setErr(null)
    try { setRun((await serverRun(P)) ?? await liveRun(data.points)) } catch (e) { setErr(`Live river data unavailable right now (${(e as Error).message}). Nothing is shown rather than a guess.`) } finally { setBusy(false) }
  }
  useEffect(() => { if (data && !date) refresh() }, [data]) // eslint-disable-line
  useEffect(() => { if (data && !date) { const id = setInterval(refresh, 15 * 60e3); return () => clearInterval(id) } }, [data, date]) // eslint-disable-line
  const [detailS, setDetailS] = useState<PointStatus | null>(null)
  useEffect(() => { setDetailS(null); if (sel === null || date || !data) return; pointSeries(P.get(sel)!).then(setDetailS) }, [sel, date]) // eslint-disable-line
  const loadVillages = async () => { if (!villages) setVillages(await fetch('/india/villages.json').then(r => r.json())) }
  useEffect(() => { if (sel !== null) loadVillages() }, [sel]) // eslint-disable-line
  // replay a past day from the stored GloFAS record (what the scan would have shown, using actual flows as the "forecast")
  useEffect(() => {
    if (!date || !data) return
    (async () => {
      const R = replay ?? await fetch('/india/replay.json').then(r => r.json()); setReplay(R)
      setRun({ at: Date.now(), date, source: 'replay', statuses: data.points.filter(p => R.q[p.id]).map(p => statusOf(p, R.days, R.q[p.id], date)) })
    })().catch(e => setErr('Replay data missing: ' + e))
  }, [date, data]) // eslint-disable-line

  const S = useMemo(() => new Map((run?.statuses ?? []).map(s => [s.id, s])), [run])
  const sum = run && data ? summarise(run.statuses, P) : null
  const attention = useMemo(() => (run?.statuses ?? []).filter(s => s.status !== 'NORMAL').sort((a, b) => (a.trend === 'rising' ? 0 : 1) - (b.trend === 'rising' ? 0 : 1) || STATUS_ORDER.indexOf(b.status) - STATUS_ORDER.indexOf(a.status) || b.ratio - a.ratio), [run])
  const byPoint = useMemo(() => { const m = new Map<number, Village[]>(); (villages ?? []).forEach(v => { const a = m.get(v.p) ?? []; a.push(v); m.set(v.p, a) }); return m }, [villages])
  const selP = sel !== null ? P.get(sel) : null, selS = sel !== null ? (detailS?.id === sel ? detailS : S.get(sel)) : null
  const selV = selS && villages ? villagesAtRisk(selS, byPoint.get(sel!) ?? []) : []
  const pick = (id: number) => { setSel(id); const p = P.get(id)!; setView(v => ({ ...v, longitude: p.lng, latitude: p.lat, zoom: 8.5, transitionDuration: 1500, transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }) })) }

  const L: any[] = [
    new GeoJsonLayer({ id: 'c', data: '/india/outline.json', filled: true, stroked: true, getFillColor: [16, 19, 24], getLineColor: [70, 78, 92], lineWidthMinPixels: 1 }),
    new PathLayer({ id: 'riv', data: data?.lines ?? [], getPath: (d: any) => d.path, getColor: [96, 165, 250, 150], widthMinPixels: 1.2 }),
    new ScatterplotLayer({ id: 'pts', data: data?.points ?? [], getPosition: (d: RiverPoint) => [d.lng, d.lat], radiusUnits: 'pixels',
      getRadius: (d: RiverPoint) => { const s = S.get(d.id)?.status ?? 'NORMAL'; return d.id === sel ? 10 : s === 'NORMAL' ? 3 : s === 'RISING' ? 6 : 8 },
      getFillColor: (d: RiverPoint) => [...RGB[S.get(d.id)?.status ?? 'NORMAL'], S.get(d.id) ? 240 : 90] as any, stroked: true, getLineColor: (d: RiverPoint) => (d.id === sel ? [255, 255, 255] : [8, 10, 14]), lineWidthMinPixels: 1,
      pickable: true, onClick: (i: PickingInfo) => pick((i.object as RiverPoint).id), updateTriggers: { getRadius: [run?.at, sel], getFillColor: run?.at, getLineColor: sel } }),
  ]
  if (selV.length) L.push(new ScatterplotLayer({ id: 'vil', data: selV, getPosition: (d: Village) => [d.lng, d.lat], radiusUnits: 'pixels', getRadius: 4, getFillColor: [...RGB[selS!.status], 230] as any, stroked: true, getLineColor: [8, 10, 14], lineWidthMinPixels: 1 }))
  if (selV.length && (view.zoom ?? 0) > 9.5) L.push(new TextLayer({ id: 'vt', data: selV.slice(0, 80), getPosition: (d: Village) => [d.lng, d.lat], getText: (d: Village) => d.n, getSize: 11, getPixelOffset: [7, 0], getTextAnchor: 'start', getColor: [241, 245, 249], fontFamily: FONT, characterSet: 'auto', outlineWidth: 3, outlineColor: [0, 0, 0, 210], fontSettings: { sdf: true } }))

  return (
    <div className="app rw">
      <DeckGL viewState={view} onViewStateChange={(e: any) => setView(e.viewState)} controller layers={L} getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        getTooltip={({ object, layer }: any) => (!object ? null : layer?.id === 'pts' ? { text: `${object.river} near ${object.near}: ${WORD[S.get(object.id)?.status ?? 'NORMAL']}` } : layer?.id === 'vil' ? { text: `${object.n}, ${object.h?.toFixed(1)} m above river, ${object.dr} km away` } : null)} />
      <header className="rwbar">
        <button className="lb-home" onClick={onHome} aria-label="Home"><FiHome /></button>
        <div><div className="eyebrow">JalNetra River Watch · {date ? 'REPLAY of a past day' : 'live'}</div><div className="title">Rivers of India</div></div>
        <div className="rwdate">
          <select value={date ?? ''} onChange={e => { setSel(null); setDate(e.target.value || null); if (!e.target.value) refresh() }}>
            <option value="">Today (live)</option>
            {['2026-09-20', '2026-09-25', '2026-09-27', '2026-09-29', '2026-10-02'].map(d => <option key={d} value={d}>Replay {new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</option>)}
          </select>
        </div>
        <div className="rwbtns"><button className="storybtn" onClick={onGandak}><FiActivity /> Gandak detail</button><button className="storybtn" onClick={onDemo}><FiPlayCircle /> Demo</button></div>
      </header>

      <aside className="rwpanel">
        {!selP ? <section>
          {!run && !err && <p className="note"><FiRefreshCw className="spin" /> Checking {data?.points.length ?? '…'} river points across India…</p>}
          {err && <p className="err">{err}</p>}
          {sum && <>
            <div className={'rwhead ' + sum.worst}>{sum.headline}</div>
            {sum.sub && <p className="rwsub">{sum.sub}</p>}
            <p className="rwsub">{run!.source !== 'replay' ? `GloFAS forecast for the next 7 days, checked ${fmtIST(run!.at)}${run!.source === 'server' ? ' by the JalNetra monitor (every 3 h)' : ''}.` : `Replay of ${new Date(run!.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}: what the scan would have flagged that day.`}</p>
            <div className="rwcounts">{(['DANGER', 'WARNING', 'RISING'] as Status[]).map(s => <div key={s} className={s}><b>{sum.by[s]}</b><span>{WORD[s]}</span></div>)}<div className="NORMAL"><b>{sum.by.NORMAL}</b><span>Normal</span></div></div>
            {attention.length > 0 ? <ol className="rwlist">{attention.slice(0, 25).map(s => { const p = P.get(s.id)!; return (
              <li key={s.id}><button onClick={() => pick(s.id)}>
                <i style={{ background: `rgb(${RGB[s.status].join(',')})` }} />
                <span><b>{p.river}</b> near {p.near}<small>{WORD[s.status]} · {ARROW[s.trend]}{s.trend === 'rising' ? `, peak ${dayName(s.peakDay)}` : ''} · {fmtQ(s.now)} m³/s</small></span>
              </button></li>) })}</ol>
              : <p className="note">No river point is forecast to reach unusual levels in the next 7 days. Monsoon is over; levels are falling across the country.</p>}
          </>}
          <button className="link" onClick={() => setHelp(h => !h)}><FiInfo /> How this works</button>
          {help && <ul className="reasons small">
            <li>{data?.points.length} points every ~40 km on India's major rivers (and the Nepal and Bangladesh stretches that feed them).</li>
            <li>Each point gets the GloFAS river forecast (EU Copernicus, ~5 km grid, updated daily) for the next 7 days.</li>
            <li>The forecast peak is compared with that same point's 2025 monsoon: above its top 10% of days = High, above its highest day = Above 2025 peak. Only one monsoon is used so far, so treat levels as a first screen.</li>
            <li>An operator alert is opened only when a river is forecast to rise into High or above, not when it is already high and falling.</li>
            <li>For Warning or Danger, villages within 3–6 km of the river and less than 3–6 m above it (Copernicus elevation) are listed as at risk. This is an estimate, not a flood map.</li>
          </ul>}
        </section> : <section>
          <button className="link back" onClick={() => setSel(null)}><FiArrowLeft /> All rivers</button>
          <div className="vhead"><div><div className="kicker">{selP.state || 'River point'}</div><div className="h big">{selP.river} near {selP.near}</div></div><button className="x" onClick={() => setSel(null)} aria-label="Close"><FiX /></button></div>
          {selS && <>
            <div className={'rwhead ' + selS.status}>{WORD[selS.status]}</div>
            <p className="rwsub">{selS.status === 'NORMAL' ? 'Flow is within this river’s usual range for the next 7 days.' : selS.status === 'RISING' ? `Flow rises from ${fmtQ(selS.now)} to ${fmtQ(selS.peak)} m³/s by ${dayName(selS.peakDay)}, still below a high monsoon day here.` : `Flow reaches ${fmtQ(selS.peak)} m³/s ${dayName(selS.peakDay)}, ${selS.status === 'DANGER' ? 'higher than any day of the 2025 monsoon at this point' : 'as high as the top 10% of 2025 monsoon days here'}.`}</p>
            {selS.series.length > 0 ? <Spark s={selS} p={selP} /> : <p className="note"><FiRefreshCw className="spin" /> Loading this river's forecast…</p>}
            {(selS.status === 'WARNING' || selS.status === 'DANGER') && <>
              <div className="kicker mt">{selV.length} low-lying villages at risk{selS.crossDay !== null ? `, from ${dayName(selS.crossDay)}` : ''}</div>
              {!villages ? <p className="note"><FiRefreshCw className="spin" /> Loading villages…</p> : selV.length ? <ul className="vlist">{selV.slice(0, 40).map(v => <li key={v.id}><b>{v.n}</b><span>{v.h?.toFixed(1)} m above river · {v.dr} km</span></li>)}</ul> : <p className="note">No mapped village is both this close and this low.</p>}
              <p className="note">Villages from GeoNames; height from Copernicus 90 m elevation. Send to an operator from the Gandak detail screen; nobody is called automatically.</p>
            </>}
            {selS.status !== 'WARNING' && selS.status !== 'DANGER' && <p className="note">{selP.nv} villages lie within 6 km of this point. They would be listed here if the forecast reached Warning.</p>}
          </>}
        </section>}
      </aside>
      <div className="rwlegend">{STATUS_ORDER.slice().reverse().map(s => <span key={s}><i style={{ background: `rgb(${RGB[s].join(',')})` }} />{WORD[s]}</span>)}{busy && <span><FiRefreshCw className="spin" /> updating</span>}</div>
    </div>
  )
}

function Spark({ s, p }: { s: PointStatus; p: RiverPoint }) {
  const w = 320, h = 90, vals = s.series.filter(Number.isFinite), mx = Math.max(...vals, p.max) * 1.08, mn = 0
  const X = (i: number) => 6 + (i / (s.series.length - 1)) * (w - 12), Y = (v: number) => 6 + (1 - (v - mn) / (mx - mn)) * (h - 22)
  const d = s.series.map((v, i) => (Number.isFinite(v) ? `${i && Number.isFinite(s.series[i - 1]) ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}` : '')).join('')
  const line = (v: number, c: string, t: string) => <g><line x1="6" x2={w - 6} y1={Y(v)} y2={Y(v)} stroke={c} strokeDasharray="3 3" strokeOpacity=".8" /><text x={w - 6} y={Y(v) - 3} fontSize="9" fill={c} textAnchor="end">{t}</text></g>
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="spark" role="img" aria-label="River flow, past and forecast">
      {line(p.max, '#fda4af', '2025 monsoon highest')}{line(p.p90, '#fbbf24', 'high monsoon day')}
      <path d={d} fill="none" stroke="#e6edf3" strokeWidth="1.8" />
      <line x1={X(s.today)} x2={X(s.today)} y1="4" y2={h - 16} stroke="#e6edf3" strokeOpacity=".4" />
      <text x={X(s.today) + 3} y={h - 18} fontSize="9" fill="#9aa7b4">today</text>
      <text x="6" y={h - 3} fontSize="9" fill="#66727f">{new Date(s.days[0]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</text>
      <text x={w - 6} y={h - 3} fontSize="9" fill="#66727f" textAnchor="end">{new Date(s.days[s.days.length - 1]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · m³/s</text>
    </svg>
  )
}
