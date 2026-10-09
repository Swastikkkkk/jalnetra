import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator, type MapViewState, type PickingInfo } from '@deck.gl/core'
import { BitmapLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import gsap from 'gsap'
import { FiPause, FiPlay, FiRefreshCw, FiSkipForward, FiLayers, FiHome, FiCheckCircle, FiX, FiChevronDown, FiChevronRight, FiPhoneCall, FiExternalLink, FiAlertTriangle, FiRotateCcw } from 'react-icons/fi'
import D from '../data.json'
import s2 from '../img/s2.jpg'
import o1 from '../img/o1.png'
import o2 from '../img/o2.png'
import o3 from '../img/o3.png'
import countries from '../countries.json'
import { HORIZONS, eventInputs, runModel, type Level, type ModelRun, type VillageRisk } from '../engine/core'
import { liveInputs } from '../engine/sources'
import { bounds, extentAt, loadTerrain, type Extent, type Terrain } from '../engine/terrain'
import { buildGraph, evacuate, impactStats, type Route } from '../engine/route'
import { approveIncident, createIncident, hasKey, listRuns, type RunSummary, listAlerts, listContacts, saveKey, sendAlerts, setStatus, type Alert, type Contact, type Incident } from '../ops'
import { FONT, HLABEL, LEVEL_RGB, M, VBY, VILLAGES, fmtIST, fmtQ, hindiAlert, impactText, windowText } from './shared'

type Mode = 'live' | 'demo'
type AlertState = { stage: 'review' | 'approving' | 'calling' | 'contacted' | 'evacuating' | 'resolved' | 'dismissed' | 'error'; incident?: Incident; error?: string; telephony?: string }
const OBS_IMG: Record<string, string> = { o1, o2, o3 }
const DEMO_START = Date.parse('2026-09-25T06:00:00Z'), DEMO_END = Date.parse('2026-10-01T00:00:00Z'), STEP_H = 3
const LIVE_EVERY = 15 * 60e3
const INITIAL: MapViewState = { longitude: 84.6, latitude: 26.5, zoom: 7.6, pitch: 0, bearing: 0, minZoom: 6, maxZoom: 13 }
const STAGES = ['Live data', 'Trend analysis', 'Water-level forecast', 'Flood extent', 'Village impact', 'Evacuation routes', 'Risk score', 'Operator approval', 'AI voice alert', 'Incident tracking']

function toCanvas(img: ImageData | null) {
  if (!img) return null
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
  c.getContext('2d')!.putImageData(img, 0, 0); return c
}

export default function Live({ mode, onHome, onValidate, onOpenIncident, onMode }: { mode: Mode; onHome: () => void; onValidate: () => void; onOpenIncident: (id: string) => void; onMode: (m: Mode) => void }) {
  const [view, setView] = useState<MapViewState>(INITIAL)
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  const [run, setRun] = useState<ModelRun | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [lastAt, setLastAt] = useState<number | null>(null)
  const [nextAt, setNextAt] = useState<number>(Date.now())
  const [clock, setClock] = useState(Date.now())
  const [sim, setSim] = useState(DEMO_START)
  const [paused, setPaused] = useState(false)
  const [period, setPeriod] = useState(30)
  const [h, setH] = useState<number>(6)
  const [sel, setSel] = useState<number | null>(null)
  const [alerts, setAlerts] = useState<Record<number, AlertState>>({})
  const [events, setEvents] = useState<{ t: number; text: string; kind: 'info' | 'warn' | 'crit' | 'ok' }[]>([])
  const [layers, setLayers] = useState({ sat: true, predicted: true, observed: mode === 'demo', villages: true, roads: false, shelters: true, route: true, rain: true, rivers: true })
  const [showLayers, setShowLayers] = useState(false)
  const [running, setRunning] = useState(false)
  const prev = useRef<ModelRun | null>(null)
  const pipeRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const [topH, setTopH] = useState(130)
  useEffect(() => { if (!topRef.current) return; const ro = new ResizeObserver(e => setTopH(Math.round(e[0].contentRect.height))); ro.observe(topRef.current); return () => ro.disconnect() }, [])

  useEffect(() => { loadTerrain(M).then(setTerrain).catch(e => setErr('Terrain grid failed to load: ' + e)) }, [])
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(id) }, [])

  // ---- the monitoring loop: fetch inputs, run the model, diff against the previous run
  const doRun = async (simNow?: number) => {
    setRunning(true)
    try {
      const inp = mode === 'live' ? await liveInputs(M) : eventInputs(M, simNow ?? sim)
      const r = runModel(M, inp)
      setRun(r); setErr(null); setLastAt(Date.now())
      diff(prev.current, r); prev.current = r
    } catch (e) { setErr(`Live sources unreachable (${(e as Error).message}). No prediction shown rather than a guess. Try the demo simulation.`) }
    finally { setRunning(false); setNextAt(Date.now() + (mode === 'live' ? LIVE_EVERY : period * 1000)) }
  }
  const diff = (a: ModelRun | null, b: ModelRun) => {
    const t = b.now, out: typeof events = []
    if (!a) out.push({ t, text: `Model run: ${b.inputs.observations} observations in, ${b.atRisk} villages at risk`, kind: 'info' })
    else {
      if (a.river !== b.river) out.push({ t, text: `River ${b.river.toLowerCase()}`, kind: b.river.startsWith('Rising') ? 'warn' : 'info' })
      if (a.rainLevel !== b.rainLevel) out.push({ t, text: `Rain level ${b.rainLevel.toLowerCase()}`, kind: b.rainLevel === 'HIGH' ? 'warn' : 'info' })
      if (a.atRisk !== b.atRisk) out.push({ t, text: `Villages at risk ${a.atRisk} → ${b.atRisk}`, kind: b.atRisk > a.atRisk ? 'warn' : 'ok' })
      const was = new Map(a.villages.map(v => [v.id, v.level]))
      const crit = b.villages.filter(v => v.level === 'CRITICAL' && was.get(v.id) !== 'CRITICAL')
      if (crit.length) out.push({ t, text: `${crit.slice(0, 3).map(v => VBY.get(v.id)!.name).join(', ')}${crit.length > 3 ? ` +${crit.length - 3}` : ''} became CRITICAL`, kind: 'crit' })
      const nh = b.villages.filter(v => v.level === 'HIGH' && !['HIGH', 'CRITICAL'].includes(was.get(v.id)!))
      if (nh.length) out.push({ t, text: `${nh.length} new HIGH-risk alert${nh.length > 1 ? 's' : ''} waiting for an operator`, kind: 'warn' })
    }
    if (!out.length) out.push({ t, text: 'Model run: no change', kind: 'info' })
    setEvents(e => [...out.reverse(), ...e].slice(0, 30))
  }
  // reset when the mode changes
  useEffect(() => { prev.current = null; setEvents([]); setAlerts({}); setSel(null); setSim(DEMO_START); setLayers(l => ({ ...l, observed: mode === 'demo' })); doRun(DEMO_START) }, [mode]) // eslint-disable-line
  // schedule
  useEffect(() => {
    if (mode === 'demo' && paused) return
    const ms = Math.max(0, nextAt - Date.now())
    const id = setTimeout(() => {
      if (mode === 'demo') { const n = Math.min(DEMO_END, sim + STEP_H * 3600e3); setSim(n); if (n >= DEMO_END) setPaused(true); doRun(n) } else doRun()
    }, ms)
    return () => clearTimeout(id)
  }, [nextAt, paused, mode, sim]) // eslint-disable-line
  const runNow = () => { if (mode === 'demo') { const n = Math.min(DEMO_END, sim + STEP_H * 3600e3); setSim(n); doRun(n) } else doRun() }
  const restart = () => { prev.current = null; setEvents([]); setAlerts({}); setSel(null); setSim(DEMO_START); setPaused(false); doRun(DEMO_START) }

  // pipeline animation on each run
  useEffect(() => {
    if (!run || !pipeRef.current) return
    const els = pipeRef.current.querySelectorAll('.stage.model')
    gsap.fromTo(els, { opacity: 0.35 }, { opacity: 1, duration: 0.25, stagger: 0.12, ease: 'power1.out' })
  }, [run])

  // ---- flood extents for each horizon
  const extents = useMemo(() => {
    if (!run || !terrain) return null
    const style = mode === 'demo' ? 'simulated' : 'predicted'
    const out: Record<number, Extent & { canvas: HTMLCanvasElement | null }> = {}
    for (const hz of HORIZONS) { const e = extentAt(M, terrain, run.stations, hz, style); out[hz] = { ...e, canvas: toCanvas(e.image) } }
    return out
  }, [run, terrain, mode])
  const graph = useMemo(() => (terrain ? buildGraph(D.roads as any, terrain) : null), [terrain])
  // routing avoids the union of water now and in 24 h
  const routeMask = useMemo(() => {
    if (!extents) return null
    const a = extents[0].mask, b = extents[24].mask, m = new Uint8Array(a.length), p = new Uint8Array(a.length)
    for (let i = 0; i < a.length; i++) { m[i] = a[i] === 2 || b[i] === 2 ? 2 : a[i] || b[i] ? 1 : 0; p[i] = Math.max(extents[0].prob[i], extents[24].prob[i]) }
    return { m, p }
  }, [extents])
  const risk = useMemo(() => new Map((run?.villages ?? []).map(v => [v.id, v])), [run])
  const routes = useMemo(() => {
    const out = new Map<number, Route | null>()
    if (!run || !graph || !terrain || !routeMask) return out
    const want = new Set(run.villages.filter(v => v.level === 'HIGH' || v.level === 'CRITICAL').sort((a, b) => b.score - a.score).slice(0, 15).map(v => v.id)); if (sel) want.add(sel)
    for (const id of want) { const v = VBY.get(id)!; out.set(id, evacuate(graph, terrain, routeMask.m, routeMask.p, M.pixel.pstar, v, M.pois)) }
    return out
  }, [run, graph, terrain, routeMask, sel])
  const stats = useMemo(() => (extents && graph && terrain ? impactStats(graph, extents[h].mask, D.roads as any, terrain, M.pois) : null), [extents, graph, terrain, h])

  const counts = run?.counts[h] ?? { LOW: 291, MEDIUM: 0, HIGH: 0, CRITICAL: 0 }
  const atRiskH = counts.MEDIUM + counts.HIGH + counts.CRITICAL
  const queue = useMemo(() => (run?.villages ?? []).filter(v => (v.level === 'HIGH' || v.level === 'CRITICAL') && alerts[v.id]?.stage !== 'dismissed').sort((a, b) => (a.level === b.level ? (a.impactH ?? 99) - (b.impactH ?? 99) : a.level === 'CRITICAL' ? -1 : 1)), [run, alerts])
  const selR = sel ? risk.get(sel) ?? null : null
  const anyApproved = Object.values(alerts).some(a => ['calling', 'contacted', 'evacuating', 'resolved'].includes(a.stage))
  const anyContacted = Object.values(alerts).some(a => ['contacted', 'evacuating', 'resolved'].includes(a.stage))
  const anyIncident = Object.values(alerts).some(a => a.incident)
  const fly = (lng: number, lat: number, zoom = 10.4) => setView(v => ({ ...v, longitude: lng, latitude: lat, zoom, transitionDuration: 1400, transitionInterpolator: new FlyToInterpolator({ speed: 1.4 }) }))
  const pick = (id: number) => { setSel(id); const v = VBY.get(id)!; fly(v.lng, v.lat) }

  // ---- map layers
  const L: any[] = []
  const tb = terrain ? bounds(terrain) : null
  L.push(new GeoJsonLayer({ id: 'countries', data: countries as any, filled: true, stroked: true, getFillColor: [16, 19, 24], getLineColor: [70, 78, 92], lineWidthMinPixels: 1 }))
  if (layers.sat) L.push(new BitmapLayer({ id: 's2', image: s2, bounds: ((D as any).s2bounds ?? D.bounds) as any, opacity: 0.9 }))
  if (layers.rivers) L.push(new PathLayer({ id: 'rivers', data: D.network, getPath: (d: any) => d, getColor: [125, 211, 252, 110], widthMinPixels: 1 }))
  if (layers.rivers) L.push(new PathLayer({ id: 'gandak', data: [{ path: D.river.path }], getPath: (d: any) => d.path, getColor: [186, 230, 253, 200], widthUnits: 'pixels', getWidth: 2.4 }))
  if (layers.observed && mode === 'demo') {
    const seen = Object.entries(M.obsTimes).filter(([, t]) => Date.parse(t) <= sim).pop()
    if (seen) L.push(new BitmapLayer({ id: 'obs-' + seen[0], image: OBS_IMG[seen[0]], bounds: D.bounds as any, opacity: 0.95, tintColor: [90, 140, 255] }))
  }
  if (layers.observed && mode === 'live') L.push(new BitmapLayer({ id: 'obs-latest', image: o3, bounds: D.bounds as any, opacity: 0.9, tintColor: [90, 140, 255] }))
  if (layers.predicted && extents && tb && extents[h].canvas) L.push(new BitmapLayer({ id: 'pred-' + h + '-' + run!.now, image: extents[h].canvas, bounds: tb, opacity: 1, textureParameters: { minFilter: 'nearest', magFilter: 'nearest' } as any }))
  if (layers.roads) L.push(new PathLayer({ id: 'roads', data: D.roads, getPath: (d: any) => d.path, getColor: [226, 232, 240, 110], widthMinPixels: 1 }))
  if (layers.rain && run) {
    const pts = M.rainPoints.map(([lat, lng]) => ({ lat, lng, mm: run.ctx.rain48 }))
    L.push(new ScatterplotLayer({ id: 'rain', data: pts, getPosition: (d: any) => [d.lng, d.lat], getRadius: (d: any) => 3000 + d.mm * 90, stroked: true, getFillColor: [147, 197, 253, 30], getLineColor: [191, 219, 254, 190], lineWidthMinPixels: 1, updateTriggers: { getRadius: run.now } }))
  }
  if (layers.shelters) L.push(new ScatterplotLayer({ id: 'pois', data: M.pois, getPosition: (d: any) => [d.x, d.y], getRadius: 2.6, radiusUnits: 'pixels', getFillColor: [52, 211, 153, 200], pickable: true }))
  const selRoute = sel ? routes.get(sel) : null
  if (layers.route && selRoute) {
    L.push(new PathLayer({ id: 'route-glow', data: [selRoute], getPath: (d: any) => d.path, getColor: [6, 20, 16, 200], getWidth: 7, widthUnits: 'pixels', capRounded: true, jointRounded: true }))
    L.push(new PathLayer({ id: 'route', data: [selRoute], getPath: (d: any) => d.path, getColor: selRoute.ok ? [52, 211, 153, 255] : [251, 191, 36, 255], getWidth: 3.5, widthUnits: 'pixels', capRounded: true, jointRounded: true, ...(selRoute.ok ? {} : { getDashArray: [5, 4], extensions: [new PathStyleExtension({ dash: true })] }) }))
    L.push(new ScatterplotLayer({ id: 'shelter-sel', data: [selRoute.shelter], getPosition: (d: any) => [d.x, d.y], getRadius: 8, radiusUnits: 'pixels', getFillColor: [52, 211, 153], stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2 }))
    L.push(new TextLayer({ id: 'shelter-t', data: [selRoute.shelter], getPosition: (d: any) => [d.x, d.y], getText: (d: any) => d.n, getSize: 12, getPixelOffset: [10, 0], getTextAnchor: 'start', getColor: [209, 250, 229], fontFamily: FONT, fontWeight: 600, characterSet: 'auto', outlineWidth: 3, outlineColor: [0, 0, 0, 220], fontSettings: { sdf: true } }))
  }
  if (layers.villages) L.push(new ScatterplotLayer({
    id: 'villages', data: VILLAGES, getPosition: (d: any) => [d.lng, d.lat], radiusUnits: 'pixels',
    getRadius: (d: any) => { const l = risk.get(d.id)?.levelAt[h] ?? 'LOW'; return d.id === sel ? 9 : l === 'LOW' ? 2.8 : l === 'MEDIUM' ? 4.5 : 6 },
    getFillColor: (d: any) => [...LEVEL_RGB[risk.get(d.id)?.levelAt[h] ?? 'LOW'], 245] as any, stroked: true,
    getLineColor: (d: any) => (d.id === sel ? [255, 255, 255, 255] : [8, 10, 14, 220]), lineWidthMinPixels: 1.2, pickable: true,
    onClick: (i: PickingInfo) => pick((i.object as any).id), updateTriggers: { getFillColor: [run?.now, h], getRadius: [run?.now, h, sel], getLineColor: sel },
  }))
  if (layers.villages && (view.zoom ?? 0) >= 9.4) L.push(new TextLayer({ id: 'vt', data: VILLAGES.filter(v => (risk.get(v.id)?.levelAt[h] ?? 'LOW') !== 'LOW' || v.id === sel), getPosition: (d: any) => [d.lng, d.lat], getText: (d: any) => d.name, getSize: 11, getPixelOffset: [9, 0], getTextAnchor: 'start', getColor: [241, 245, 249, 235], fontFamily: FONT, fontWeight: 500, characterSet: 'auto', outlineWidth: 3, outlineColor: [0, 0, 0, 210], fontSettings: { sdf: true }, updateTriggers: { getText: [run?.now, h] } }))
  if (run) {
    const sd = M.stations.map((s, i) => ({ ...s, f: run.stations[i] }))
    L.push(new ScatterplotLayer({ id: 'stations', data: sd, getPosition: (d: any) => [d.lng, d.lat], getRadius: 5, radiusUnits: 'pixels', getFillColor: [255, 255, 255], stroked: true, getLineColor: [15, 23, 42], lineWidthMinPixels: 1.5 }))
    L.push(new TextLayer({ id: 'st-t', data: sd, getPosition: (d: any) => [d.lng, d.lat], getText: (d: any) => `${d.label}  ${fmtQ(d.f.q[72 + h])} m³/s${d.f.trend.startsWith('Rising') ? ' ↑' : d.f.trend === 'Falling' ? ' ↓' : ''}`, getSize: 12, getPixelOffset: [10, 0], getTextAnchor: 'start', getColor: [255, 255, 255], fontFamily: FONT, fontWeight: 600, characterSet: 'auto', outlineWidth: 4, outlineColor: [0, 0, 0, 220], fontSettings: { sdf: true }, updateTriggers: { getText: [run.now, h] } }))
  }

  const secs = Math.max(0, Math.round((nextAt - clock) / 1000))
  const simLabel = mode === 'demo' ? fmtIST(sim) : null
  const tick = (k: keyof typeof layers) => setLayers(s => ({ ...s, [k]: !s[k] }))

  return (
    <div className={'app live ' + mode} style={{ ['--top' as any]: `${topH + 18}px` }}>
      <DeckGL viewState={view} onViewStateChange={(e: any) => setView(e.viewState)} controller layers={L} getCursor={({ isHovering }) => (isHovering ? 'pointer' : 'grab')}
        getTooltip={({ object, layer }: any) => !object ? null : layer?.id === 'villages' ? { text: `${object.name} · ${risk.get(object.id)?.levelAt[h] ?? 'LOW'} at ${HLABEL[h]}` } : layer?.id === 'pois' ? { text: `${object.n} (${object.a === 'h' ? 'hospital' : 'school / college'})` } : null} />

      <div className="ltop" ref={topRef}>
      {/* ---------- status bar ---------- */}
      <header className="lbar">
        <button className="lb-home" onClick={onHome} aria-label="Home"><FiHome /></button>
        <div className="lb-brand"><div className="eyebrow">JalNetra · Gandak basin</div><div className="title">Live flood intelligence</div></div>
        <div className={'modebadge ' + mode}>{mode === 'live' ? <><i className="dot" />LIVE</> : <><i className="dot" />LIVE DEMO SIMULATION</>}</div>
        {run && <>
          <Stat k="River" v={run.river.toUpperCase()} tone={run.river.startsWith('Rising') ? 'warn' : 'ok'} />
          <Stat k="Rain" v={run.rainMissing ? 'NO DATA' : run.rainLevel} tone={run.rainLevel === 'HIGH' ? 'warn' : 'ok'} />
          <Stat k="Overall risk" v={run.overall} tone={run.overall === 'LOW' ? 'ok' : run.overall === 'MEDIUM' ? 'mid' : 'warn'} />
          <Stat k={`Villages at risk ${HLABEL[h]}`} v={<><Count n={atRiskH} /> <span className="dim">/ 291</span></>} tone={atRiskH ? 'warn' : 'ok'} />
          <div className="lb-levels"><span className="lv CRITICAL">{counts.CRITICAL} critical</span><span className="lv HIGH">{counts.HIGH} high</span><span className="lv MEDIUM">{counts.MEDIUM} medium</span></div>
        </>}
        <div className="lb-time">
          <div><span className="dim">LAST UPDATED</span> {lastAt ? fmtIST(lastAt, false) + ':' + String(new Date(lastAt).getSeconds()).padStart(2, '0') : '...'}</div>
          <div><span className="dim">NEXT MODEL RUN</span> {mode === 'demo' && paused ? 'paused' : `${fmtIST(nextAt, false)} · ${secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`}`}</div>
          {simLabel && <div className="simclock"><span className="dim">SIMULATED CLOCK</span> {simLabel}</div>}
        </div>
        <div className="lb-btns">
          <div className="seg"><button className={mode === 'live' ? 'on' : ''} onClick={() => onMode('live')}>Live</button><button className={mode === 'demo' ? 'on' : ''} onClick={() => onMode('demo')}>Demo</button></div>
          <button className="storybtn" onClick={onValidate}>2026 validation</button>
        </div>
      </header>

      {/* ---------- pipeline ---------- */}
      <div className="pipe" ref={pipeRef} aria-label="Prediction pipeline">
        {STAGES.map((s, i) => {
          const val = !run ? '' : [
            `${run.inputs.observations} obs`, run.river, `+24h ${fmtQ(run.stations[run.stations.length - 1].q[96])}`, `${extents?.[h].km2 ?? '…'} km²`, `${atRiskH} villages`,
            `${[...routes.values()].filter(Boolean).length} routes`, `${run.villages.filter(v => v.level === 'CRITICAL').length} critical`,
            `${queue.filter(q => !alerts[q.id] || alerts[q.id].stage === 'review').length} waiting`, anyApproved ? 'call placed' : 'none yet', anyIncident ? 'tracking' : 'none yet'][i]
          const on = i < 7 ? !!run : i === 7 ? queue.length > 0 : i === 8 ? anyApproved : anyContacted || anyIncident
          return <div key={s} className={'stage' + (i < 7 ? ' model' : ' human') + (on ? ' on' : '') + (i === 7 ? ' gate' : '')}><span className="sn">{i + 1}</span><span className="st">{s}</span><span className="sv">{val}</span></div>
        })}
      </div>
      </div>

      {err && <div className="lerr"><FiAlertTriangle /> {err} {mode === 'live' && <button onClick={() => onMode('demo')}>Run the demo simulation</button>}</div>}
      {!run && !err && <div className="lerr info"><FiRefreshCw className="spin" /> Fetching river and rain data, running the model…</div>}

      {/* ---------- left: forecast + inputs + impact timeline ---------- */}
      {run && <aside className="lpanel left">
        <Forecast run={run} />
        <ImpactTimeline run={run} onPick={pick} sel={sel} />
        <section>
          <div className="kicker">Inputs this run</div>
          <dl className="kv small">
            <dt>River</dt><dd>{run.inputs.byType.river_discharge ?? 0} GloFAS discharge values, 7 points{mode === 'demo' ? ' (2026 replay)' : ''}</dd>
            <dt>Rain</dt><dd>{run.inputs.byType.rainfall ?? 0} daily values, 4 points in Nepal{mode === 'demo' ? ' (ERA5 2026 replay, no rain forecast used)' : ' (incl. 3-day forecast)'}</dd>
            <dt>Terrain</dt><dd>Copernicus DEM height above channel, JRC normal water</dd>
            <dt>Model</dt><dd>v{run.version}, calibrated on 3 Sentinel-1 flood maps</dd>
          </dl>
          {mode === 'live' && <MonitorStatus />}
          {mode === 'live' && <p className="note">GloFAS is a global river model, not a gauge. There is no public real-time gauge feed for the Gandak, so "now" means GloFAS's latest daily estimate.</p>}
          {mode === 'demo' && <p className="note">Simulation: the September 2026 flood replayed as if it were happening now. The model only sees data up to the simulated clock.</p>}
        </section>
      </aside>}

      {/* ---------- right: alert queue or village ---------- */}
      {run && <aside className="lpanel right">
        {selR ? <VillagePanel r={selR} route={routes.get(selR.id) ?? null} run={run} mode={mode} h={h} st={alerts[selR.id]} setSt={s => setAlerts(a => ({ ...a, [selR.id]: { ...(a[selR.id] ?? {}), ...s } as AlertState }))} onClose={() => setSel(null)} onOpenIncident={onOpenIncident} />
          : <AlertQueue queue={queue} alerts={alerts} onView={pick} onDismiss={id => setAlerts(a => ({ ...a, [id]: { stage: 'dismissed' } }))} onOpenIncident={onOpenIncident} mode={mode} />}
        {stats && <section>
          <div className="kicker">Potentially affected at {HLABEL[h]}</div>
          <dl className="kv small">
            <dt>Flood area</dt><dd>{extents![h].km2.toLocaleString()} km² predicted water</dd>
            <dt>Villages</dt><dd>{atRiskH} of 291 tracked</dd>
            <dt>Roads</dt><dd>{stats.roadsHit} mapped roads, {stats.roadKm} km under predicted water</dd>
            <dt>Schools</dt><dd>{stats.schools} schools or colleges</dd>
            <dt>Hospitals</dt><dd>{stats.hospitals}</dd>
            <dt>People</dt><dd>Not estimated: no village population data loaded</dd>
          </dl>
        </section>}
      </aside>}

      {/* ---------- bottom: horizon + controls + events ---------- */}
      <footer className="lfoot">
        <div className="hz" role="group" aria-label="Forecast horizon">
          {HORIZONS.map(x => <button key={x} className={h === x ? 'on' : ''} onClick={() => setH(x)}>{HLABEL[x]}<small>{run ? `${(run.counts[x].MEDIUM + run.counts[x].HIGH + run.counts[x].CRITICAL)} vil.` : ''}</small></button>)}
          <button className="play" aria-label="Play forecast" onClick={() => { let k = 0; const id = setInterval(() => { setH(HORIZONS[k]); k++; if (k >= HORIZONS.length) clearInterval(id) }, 900) }}><FiPlay /> Play</button>
        </div>
        <div className="ctrl">
          {mode === 'demo' && <>
            <button onClick={() => setPaused(p => !p)}>{paused ? <><FiPlay /> Resume</> : <><FiPause /> Pause</>}</button>
            <button onClick={runNow} disabled={running}><FiSkipForward /> +3 h now</button>
            <div className="seg"><button className={period === 30 ? 'on' : ''} onClick={() => { setPeriod(30); setNextAt(Date.now() + 30000) }}>30 s</button><button className={period === 8 ? 'on' : ''} onClick={() => { setPeriod(8); setNextAt(Date.now() + 8000) }}>8 s</button></div>
            <button onClick={restart}><FiRotateCcw /> Restart</button>
          </>}
          {mode === 'live' && <button onClick={runNow} disabled={running}><FiRefreshCw className={running ? 'spin' : ''} /> Run model now</button>}
          <button onClick={() => setShowLayers(s => !s)}><FiLayers /> Layers</button>
        </div>
        <ol className="feed">{events.slice(0, 4).map((e, i) => <li key={i} className={e.kind}><span className="dim">{fmtIST(e.t, mode === 'demo')}</span> {e.text}</li>)}</ol>
      </footer>
      {showLayers && <div className="lpop">
        {([['predicted', mode === 'demo' ? 'Simulated prediction' : 'Predicted flood'], ['observed', mode === 'demo' ? 'Observed flood (Sentinel-1, 2026)' : 'Last radar flood map (3 Oct)'], ['villages', 'Village risk'], ['route', 'Evacuation route'], ['shelters', 'Schools, hospitals'], ['roads', 'Roads'], ['rain', 'Rainfall (48 h)'], ['rivers', 'Rivers'], ['sat', 'Satellite imagery']] as const).map(([k, l]) => <label key={k} className="tg"><input type="checkbox" checked={layers[k]} onChange={() => tick(k)} /><span>{l}</span></label>)}
        <div className="legend2">
          <div><i className={'sw2 ' + (mode === 'demo' ? 'sim' : 'pred')} />{mode === 'demo' ? 'SIMULATED: model output on replayed data' : 'PREDICTED: model output'}</div>
          <div><i className="sw2 obs" />OBSERVED: Sentinel-1 radar</div>
          <div className="dots">{(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as Level[]).map(l => <span key={l}><i style={{ background: `rgb(${LEVEL_RGB[l].join(',')})` }} />{l}</span>)}</div>
        </div>
      </div>}
    </div>
  )
}

function Stat({ k, v, tone }: { k: string; v: React.ReactNode; tone: 'ok' | 'mid' | 'warn' }) {
  return <div className={'lstat ' + tone}><div className="k">{k}</div><div className="v">{v}</div></div>
}
function Count({ n }: { n: number }) {
  const ref = useRef<HTMLSpanElement>(null), last = useRef(n)
  useEffect(() => { const o = { v: last.current }; gsap.to(o, { v: n, duration: 0.8, ease: 'power2.out', onUpdate: () => { if (ref.current) ref.current.textContent = String(Math.round(o.v)) } }); last.current = n }, [n])
  return <span ref={ref}>{n}</span>
}

function Forecast({ run }: { run: ModelRun }) {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section>
      <div className="kicker">River forecast · m³/s</div>
      <table className="fc">
        <thead><tr><th></th><th>Now</th><th>+6h</th><th>+12h</th><th>+24h</th></tr></thead>
        <tbody>{run.stations.map((s, i) => (
          <Fragment key={s.name}>
            <tr className="fr" onClick={() => setOpen(open === i ? null : i)}>
              <td>{open === i ? <FiChevronDown /> : <FiChevronRight />} {s.label.replace(' barrage', '').replace(', Nepal', '')}<span className={'tr ' + (s.trend.startsWith('Rising') ? 'up' : s.trend === 'Falling' ? 'down' : '')}>{s.trend.startsWith('Rising') ? '↑' : s.trend === 'Falling' ? '↓' : '→'}</span></td>
              <td>{fmtQ(s.q0)}</td>{[6, 12, 24].map((hz, k) => <td key={hz} className={'c-' + s.conf[k + 2]}>{fmtQ(s.q[72 + hz])}</td>)}
            </tr>
            {open === i && <tr><td colSpan={5}><StationDetail s={s} /></td></tr>}
          </Fragment>
        ))}</tbody>
      </table>
      <p className="note">Colour of a forecast = confidence: <span className="c-High">high</span>, <span className="c-Medium">medium</span>, <span className="c-Low">low</span>. Tap a station for the breakdown.</p>
    </section>
  )
}
function StationDetail({ s }: { s: ModelRun['stations'][number] }) {
  const w = 300, hgt = 86, xs = s.q.map((_, i) => i), mx = Math.max(...s.hi) * 1.04, mn = Math.min(...s.lo) * 0.96
  const X = (i: number) => 4 + (i / (xs.length - 1)) * (w - 8), Y = (v: number) => 6 + (1 - (v - mn) / (mx - mn)) * (hgt - 20)
  const line = (a: number[], from = 0, to = a.length) => a.slice(from, to).map((v, i) => `${i ? 'L' : 'M'}${X(i + from).toFixed(1)},${Y(v).toFixed(1)}`).join('')
  const band = line(s.hi, 72) + s.lo.map((v, i) => [i, v] as const).slice(72).reverse().map(([i, v]) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('') + 'Z'
  return (
    <div className="sdet">
      <svg viewBox={`0 0 ${w} ${hgt}`} className="spark" role="img" aria-label={`Forecast at ${s.label}`}>
        <path d={band} fill="rgba(34,211,238,.16)" />
        <path d={line(s.q, 0, 73)} fill="none" stroke="#e6edf3" strokeWidth="1.6" />
        <path d={line(s.q, 72)} fill="none" stroke="#22d3ee" strokeWidth="1.6" strokeDasharray="4 3" />
        <line x1={X(72)} x2={X(72)} y1="4" y2={hgt - 14} stroke="#e6edf3" strokeOpacity=".5" />
        <text x={X(72) + 3} y="12" fontSize="9" fill="#9aa7b4">now</text>
        <text x="4" y={hgt - 2} fontSize="9" fill="#66727f">−72 h</text><text x={w - 4} y={hgt - 2} fontSize="9" fill="#66727f" textAnchor="end">+48 h</text>
      </svg>
      <table className="parts"><thead><tr><th>Change vs now</th>{[6, 12, 24].map(hz => <th key={hz}>+{hz}h</th>)}</tr></thead><tbody>
        {(['trend', 'route', 'rain', 'glofas'] as const).map(k => (
          <tr key={k}><td>{{ trend: 'Recent trend', route: 'Water from upstream', rain: 'Rain in Nepal', glofas: 'GloFAS forecast' }[k]}</td>{[2, 3, 4].map(j => { const v = s.parts[j][k]; return <td key={j}>{v === null ? '–' : `${v >= 0 ? '+' : ''}${fmtQ(v)}`}</td> })}</tr>
        ))}
      </tbody></table>
      <p className="note">Trend is damped over 10 h. Upstream water travels at {M.celerity} km/h (fitted to the 2026 peak timing). Rain adds {M.rain.kappa} m³/s per mm, peaking {M.rain.tp} h later. GloFAS, when available, takes over with lead time.</p>
    </div>
  )
}

function ImpactTimeline({ run, onPick, sel }: { run: ModelRun; onPick: (id: number) => void; sel: number | null }) {
  const items = run.villages.filter(v => v.impactH !== null && v.impactH <= 24 && v.level !== 'LOW').sort((a, b) => (a.level === b.level ? a.impactH! - b.impactH! : a.level === 'CRITICAL' ? -1 : b.level === 'CRITICAL' ? 1 : a.level === 'HIGH' ? -1 : 1))
  const B = [[0, 0, 'NOW'], [1, 3, '+3H'], [4, 6, '+6H'], [7, 12, '+12H'], [13, 24, '+24H']] as const
  return (
    <section>
      <div className="kicker">Time to impact · {items.length} village{items.length === 1 ? '' : 's'} within 24 h</div>
      {!items.length ? <div className="empty">No village is predicted to flood in the next 24 hours.</div> : <div className="itl">
        {B.map(([a, b, l]) => { const xs = items.filter(v => v.impactH! >= a && v.impactH! <= b); return (
          <div key={l} className="col"><div className="ch">{l}<span>{xs.length}</span></div>
            {xs.slice(0, 7).map(v => <button key={v.id} className={'chip ' + v.level + (sel === v.id ? ' sel' : '')} onClick={() => onPick(v.id)} title={`${VBY.get(v.id)!.name}: ${v.level}, impact ${impactText(v)}`}>{VBY.get(v.id)!.name}</button>)}
            {xs.length > 7 && <div className="more">+{xs.length - 7} more</div>}
          </div>) })}
      </div>}
    </section>
  )
}

function AlertQueue({ queue, alerts, onView, onDismiss, onOpenIncident, mode }: { queue: VillageRisk[]; alerts: Record<number, AlertState>; onView: (id: number) => void; onDismiss: (id: number) => void; onOpenIncident: (id: string) => void; mode: Mode }) {
  return (
    <section>
      <div className="kicker live">Alert queue · operator approval required</div>
      <p className="note tight">The model creates alerts. Nobody is called until an operator reviews and approves.</p>
      {!queue.length && <div className="empty">No HIGH or CRITICAL villages right now.</div>}
      <ol className="aq">{queue.slice(0, 12).map((r, i) => {
        const v = VBY.get(r.id)!, st = alerts[r.id]
        return (
          <li key={r.id} className={r.level}>
            <div className="aqh"><span className="n">{i + 1}</span><b>{v.name}</b><span className={'pill lv-' + r.level}>{r.level}</span><span className="dim">impact {impactText(r)}</span></div>
            <div className="aqm">{Math.round(r.pMax * 100)}% · {r.action}{mode === 'demo' ? ' · simulation' : ''}{st && st.stage !== 'review' ? ` · ${st.stage}` : ''}</div>
            <div className="aqb">
              <button onClick={() => onView(r.id)}>View</button>
              <button className="pri" onClick={() => onView(r.id)}>Approve alert</button>
              <button className="ghost" onClick={() => onDismiss(r.id)}>Dismiss</button>
              {st?.incident && <button className="ghost" onClick={() => onOpenIncident(st.incident!.id)}><FiExternalLink /> Incident</button>}
            </div>
          </li>
        )
      })}</ol>
    </section>
  )
}

function VillagePanel({ r, route, run, mode, h, st, setSt, onClose, onOpenIncident }: { r: VillageRisk; route: Route | null; run: ModelRun; mode: Mode; h: number; st?: AlertState; setSt: (s: Partial<AlertState>) => void; onClose: () => void; onOpenIncident: (id: string) => void }) {
  const v = VBY.get(r.id)!
  const [why, setWhy] = useState(true)
  const [review, setReview] = useState(false)
  const [msg, setMsg] = useState(() => hindiAlert(v.name, r, route, mode === 'demo'))
  const [demoPhone, setDemoPhone] = useState(true)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [calls, setCalls] = useState<Alert[]>([])
  const [keyIn, setKeyIn] = useState('')
  const [, force] = useState(0)
  useEffect(() => { setMsg(hindiAlert(v.name, r, route, mode === 'demo')); setReview(false) }, [r.id]) // eslint-disable-line
  useEffect(() => { if (hasKey()) listContacts(v.lat, v.lng, 25).then(setContacts).catch(() => {}) }, [r.id, keyIn]) // eslint-disable-line
  useEffect(() => {
    if (!st?.incident || !['calling', 'contacted', 'evacuating', 'resolved'].includes(st.stage)) return
    const load = () => listAlerts(st.incident!.id).then(setCalls).catch(() => {})
    load(); const id = setInterval(load, 10000); return () => clearInterval(id)
  }, [st?.incident?.id, st?.stage])
  const maxPts = r.factors.reduce((a, f) => a + f.max, 0)
  const ctx = {
    place: `${v.name}, ${v.district || 'Bihar'}`, title: `Predicted flood: ${v.name} ${r.level}`, source: mode === 'demo' ? 'JalNetra prediction on replayed 2026 data (simulation)' : 'JalNetra prediction (GloFAS river model + Open-Meteo rain + terrain)',
    observed: fmtIST(run.now), safe_place: route ? `${route.shelter.n}, ${route.km.toFixed(1)} km away` : 'nearest high ground', village: v.name, risk: `${r.level} (${Math.round(r.pMax * 100)}% flood probability within 24 h)`,
    impact_time: r.impactH === null ? 'not within 48 hours' : r.impactH === 0 ? 'water predicted now' : `about ${r.impactH} hours (window ${windowText(r)})`,
    route: route ? `${route.km.toFixed(1)} km to ${route.shelter.n}, ${route.roadKm.toFixed(1)} km of it on roads. ${route.why}` : 'no dry shelter found within 30 km', model_updated: fmtIST(run.at), simulated: mode === 'demo',
  }
  const approve = async () => {
    setSt({ stage: 'approving', error: undefined })
    try {
      const why = r.factors.filter(f => f.pts >= 3).map(f => `${f.label}: ${f.detail}`).join('; ')
      const prediction = { level: r.level, p: Math.round(r.pMax * 100) / 100, impactH: r.impactH, window: r.window, score: r.score, conf: r.conf, action: r.action, why, factors: r.factors.map(f => ({ label: f.label, pts: Math.round(f.pts), detail: f.detail })), issued_for: new Date(run.now).toISOString(), model_version: run.version }
      const created = await createIncident({ incident_type: 'river_flood', severity: 'high', source: 'forecast', status: 'alert_created', lat: v.lat, lng: v.lng, confidence: Math.min(1, r.pMax), title: `${mode === 'demo' ? 'SIMULATION · ' : ''}Predicted flood: ${v.name} ${r.level}, impact ${impactText(r)}`, details: { village: v.name, district: v.district, simulated: mode === 'demo', prediction, route: ctx.route } })
      const inc = await approveIncident(created.incident, `Approved by operator after review. ${why}`)
      setSt({ stage: 'calling', incident: inc })
      const res = await sendAlerts(inc.id, picked, msg, 'call', { demo: demoPhone, context: ctx as any })
      setSt({ stage: res.results.some(x => x.status === 'sent') ? 'contacted' : 'error', incident: { ...inc, status: res.status ?? inc.status }, telephony: res.telephony, error: res.results.some(x => x.status === 'sent') ? undefined : res.results.map(x => `${x.contact}: ${x.error ?? x.status}`).join('; ') || 'No recipients' })
    } catch (e) { setSt({ stage: 'error', error: (e as Error).message }) }
  }
  const move = async (s: 'evacuating' | 'resolved') => { if (!st?.incident) return; try { const u = await setStatus(st.incident.id, s, s === 'evacuating' ? 'Evacuation started after the call' : 'Village reported safe'); setSt({ stage: s, incident: u.incident }) } catch (e) { setSt({ error: (e as Error).message }) } }
  const stage = st?.stage ?? 'review'
  return (
    <section className="vpanel">
      <div className="vhead"><div><div className="kicker">{v.district ? `${v.district} district` : 'Village'} · {v.ch.toFixed(0)} km below Devghat</div><div className="h big">{v.name}</div></div><button className="x" onClick={onClose} aria-label="Close"><FiX /></button></div>
      <div className="pills"><span className={'pill lv-' + r.level}>{r.level} RISK</span>{mode === 'demo' && <span className="pill sim">SIMULATION</span>}<span className="pill safe">score {r.score}/100</span></div>
      <dl className="kv">
        <dt>Flood probability</dt><dd><b>{Math.round(r.pMax * 100)}%</b> within 24 h · {Math.round(r.pAt[h] * 100)}% at {HLABEL[h]}</dd>
        <dt>Expected impact</dt><dd><b>{windowText(r)}</b></dd>
        <dt>Predicted depth</dt><dd>Not estimated. The model predicts whether water reaches the village, not how deep; depth needs a stage gauge or hydraulic model.</dd>
        <dt>Confidence</dt><dd>{r.conf.toUpperCase()}</dd>
        <dt>Recommended</dt><dd><b>{r.action}</b></dd>
      </dl>
      <button className="whybtn" onClick={() => setWhy(w => !w)}>{why ? <FiChevronDown /> : <FiChevronRight />} Why is this village at risk?</button>
      {why && <div className="why">
        {r.factors.map(f => <div key={f.label} className="fac"><div className="fl"><span>{f.pts >= 3 ? '+ ' : ''}{f.label}</span><span className="dim">{Math.round(f.pts)}/{f.max}</span></div><div className="fb"><i style={{ width: `${(f.pts / f.max) * 100}%` }} /></div><div className="fd">{f.detail}</div></div>)}
        <div className="dim tiny">Risk score {r.score} of {maxPts}. CRITICAL needs ≥50% probability, score ≥65 and impact within 12 h. Probability comes from a logistic model fitted to 2026 radar; its terms (log-odds):</div>
        <ul className="terms">{r.terms.map(t => <li key={t.label}><span>{t.label}</span><span className={t.value >= 0 ? 'pos' : 'neg'}>{t.value >= 0 ? '+' : ''}{t.value.toFixed(2)}</span></li>)}</ul>
      </div>}
      <div className="kicker mt">Evacuation route</div>
      {route ? <>
        <p className="route"><b>{v.name}</b> → {route.km.toFixed(1)} km {route.ok ? 'route avoiding likely water' : 'least-exposed route'} ({route.roadKm.toFixed(1)} km on mapped roads) → <b>{route.shelter.n}</b> ({route.shelter.a === 'h' ? 'hospital' : 'school / college'}{['School', 'Hospital'].includes(route.shelter.n) ? ', unnamed in OpenStreetMap' : ''})</p>
        <p className="note">{route.why}</p>
        <p className="note dim">Shelter: nearest mapped school, college or hospital outside predicted water (OpenStreetMap). Not a confirmed relief camp.</p>
      </> : <p className="note">No school or hospital that stays dry within 30 km without crossing a river.</p>}

      {/* ---- human in the loop ---- */}
      {(r.level === 'HIGH' || r.level === 'CRITICAL' || r.level === 'MEDIUM') && <div className="approve">
        <div className="kicker mt">Operator decision</div>
        {stage === 'review' && !review && <div className="aqb"><button className="pri" onClick={() => setReview(true)}><FiPhoneCall /> Review and approve alert</button></div>}
        {stage === 'review' && review && <>
          <div className="whyalert"><div className="kicker">Why this alert was created</div><ul className="reasons">{r.factors.filter(f => f.pts >= 3).map(f => <li key={f.label}><b>{f.label}</b>: {f.detail}</li>)}</ul></div>
          {!hasKey() ? <><p className="note">Paste the operator key (TEAM_KEYS.txt) to approve and call.</p><input className="note-in" placeholder="jn_..." value={keyIn} onChange={e => setKeyIn(e.target.value)} /><div className="aqb"><button className="pri" disabled={!keyIn.trim()} onClick={() => { saveKey(keyIn); force(x => x + 1) }}>Connect</button></div></> : <>
            <div className="kicker mt">Who gets the Hindi AI call</div>
            {contacts.length > 0 ? <ul className="clist">{contacts.map(c => <li key={c.id}><label><input type="checkbox" checked={picked.includes(c.id)} onChange={e => setPicked(p => e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id))} /><span><b>{c.name}</b> · {c.role}, {c.place_name} <span className="imeta">{c.km?.toFixed(1)} km</span></span></label></li>)}</ul> : <p className="note tight">No sarpanch or NGO contact saved within 25 km yet (add them in Incidents).</p>}
            <label className="demo-row"><input type="checkbox" checked={demoPhone} onChange={e => setDemoPhone(e.target.checked)} /> <span>Call the demo phone</span></label>
            <textarea className="note-in msg" rows={6} value={msg} onChange={e => setMsg(e.target.value)} />
            <p className="note tight">The AI agent speaks this first, then answers questions such as "हमें कहाँ जाना चाहिए?" from this prediction: village, risk, impact time, shelter, route and model time.</p>
            <div className="aqb"><button className="pri" disabled={!picked.length && !demoPhone} onClick={approve}><FiCheckCircle /> Approve alert and call</button><button className="ghost" onClick={() => setReview(false)}>Cancel</button></div>
          </>}
        </>}
        {stage !== 'review' && stage !== 'dismissed' && <ol className="steps">
          {[['Alert created', true], ['Operator approved', stage !== 'approving'], ['Hindi AI call placed', ['contacted', 'evacuating', 'resolved'].includes(stage)], ['Sarpanch contacted', ['contacted', 'evacuating', 'resolved'].includes(stage)], ['Evacuation initiated', ['evacuating', 'resolved'].includes(stage)], ['Resolved', stage === 'resolved']].map(([l, ok]) => <li key={l as string} className={ok ? 'ok' : ''}><FiCheckCircle /> {l}</li>)}
        </ol>}
        {stage === 'approving' && <p className="note"><FiRefreshCw className="spin" /> Creating incident and recording approval…</p>}
        {stage === 'calling' && <p className="note"><FiRefreshCw className="spin" /> Placing the call…</p>}
        {st?.error && <p className="err"><FiAlertTriangle /> {st.error}</p>}
        {calls.length > 0 && <ul className="tl">{calls.slice(0, 4).map(a => <li key={a.id}><b>{a.jn_contacts?.name ?? 'Demo phone'}: {a.status !== 'sent' ? a.status : a.call_status && a.call_status !== 'dispatched' ? a.call_status.replace('-', ' ') : 'ringing'}</b>{a.questions && a.questions.length > 0 && <div className="tlnote">Asked: {a.questions.join(' · ')}</div>}{a.summary && <div className="tlnote">{a.summary}</div>}</li>)}</ul>}
        {st?.incident && <div className="aqb">
          {stage === 'contacted' && <button onClick={() => move('evacuating')}>Evacuation started</button>}
          {(stage === 'contacted' || stage === 'evacuating') && <button className="ghost" onClick={() => move('resolved')}>Resolved</button>}
          <button className="ghost" onClick={() => onOpenIncident(st.incident!.id)}><FiExternalLink /> Open incident</button>
        </div>}
      </div>}
    </section>
  )
}

function MonitorStatus() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null)
  useEffect(() => { if (!hasKey()) return; const load = () => listRuns().then(setRuns).catch(() => {}); load(); const id = setInterval(load, 60000); return () => clearInterval(id) }, [])
  if (!runs?.length) return <p className="note">Server monitor: runs every 15 minutes on the backend and opens alerts for HIGH or CRITICAL villages (operator key needed to see its log).</p>
  const r = runs[0]
  return <p className="note">Server monitor (every 15 min): last run {fmtIST(r.created_at)}, {r.error ? `failed: ${r.error}` : `${r.overall} overall, ${r.at_risk} villages at risk, ${r.alerts_created} new alert${r.alerts_created === 1 ? '' : 's'}`}. {runs.length} runs logged.</p>
}
