// The 26 August 2026 Langtang Lirung glacier collapse, told minute by minute from the official timeline
// (DHM / Flood Forecasting Division, USGS, Nepali Times, PTI) on a river traced from the Copernicus DEM.
import { useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { FlyToInterpolator, WebMercatorViewport, type MapViewState } from '@deck.gl/core'
import { BitmapLayer, GeoJsonLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { FiArrowLeft, FiArrowRight, FiPlay, FiActivity } from 'react-icons/fi'
import gsap from 'gsap'
import A from '../aug.json'
import D from '../data.json'
import countries from '../countries.json'
import s2 from '../img/s2.jpg'
import before from '../img/aug_before.jpg'
import after from '../img/aug_after.jpg'
import valley from '../img/aug_valley.jpg'

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", Helvetica, Arial, sans-serif'
const S2B = ((D as any).s2bounds ?? D.bounds) as [number, number, number, number]
const PATH = A.path as [number, number][]
const KM = A.km
const PL = Object.fromEntries(A.places.map(p => [p.id, p]))
const VALM = PL.vb.km
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const WAVE = A.wave.map(([t, k]) => [mins(t as string), k as number])
const T0 = mins('08:37'), TEND = mins('16:00')
const hhmm = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`
const waveKm = (t: number) => {
  if (t <= WAVE[0][0]) return 0
  for (let i = 1; i < WAVE.length; i++) if (t <= WAVE[i][0]) { const [t0, k0] = WAVE[i - 1], [t1, k1] = WAVE[i]; return k0 + (k1 - k0) * (t - t0) / (t1 - t0) }
  return WAVE[WAVE.length - 1][1]
}
const upTo = (k: number) => { const out: [number, number][] = []; for (let i = 0; i < PATH.length && KM[i] <= k; i++) out.push(PATH[i]); return out }
const ptAt = (k: number): [number, number] => { let j = 0; while (j < KM.length - 2 && KM[j + 1] < k) j++; const f = Math.min(Math.max((k - KM[j]) / Math.max(KM[j + 1] - KM[j], 1e-6), 0), 1); return [PATH[j][0] + (PATH[j + 1][0] - PATH[j][0]) * f, PATH[j][1] + (PATH[j + 1][1] - PATH[j][1]) * f] }
// when each gauge went offline (or hit its first alert), minutes after midnight NPT
const GAUGE_T: Record<string, { off?: number; alert?: number }> = { gy: { off: mins('08:44') }, sy: { off: mins('08:50') }, be: { off: mins('09:20') }, ml: { alert: mins('11:20'), off: mins('11:43') }, dg: {} }
const G = A.gauges.map(g => ({ ...PL[g.id], ...g }))

type Step = { kicker: string; title: string; body: string; facts?: [string, string][]; view: Partial<MapViewState> | 'fit' | 'india'; t: number; play?: [number, number]; images?: boolean; chart?: boolean; india?: boolean; end?: boolean }
const STEPS: Step[] = [
  { kicker: '26 August 2026 · Nepal to India', title: 'A glacier fell, and the river carried it to India', view: 'fit', t: T0 - 1,
    body: `At 08:37 on 26 August, ice and rock broke off Langtang Lirung on the Nepal and Tibet border. The surge ran down the Lhende Khola and the Trishuli, joined the Narayani at Devghat and reached the Gandak at Valmikinagar barrage, ${Math.round(VALM)} km downstream. This replays it with the official timeline, the river gauges and satellite images.`,
    facts: [['Trigger', 'Glacier collapse, not rain'], ['Dead in Nepal', '939 (NDRRMA)'], ['Glacier to India', `${Math.round(VALM)} km of river`]] },
  { kicker: '08:37 · The collapse', title: 'Ice and rock fall 1.2 km', view: { longitude: 85.47, latitude: 28.275, zoom: 11.6 }, t: T0, images: true,
    body: 'About 0.2 km² of ice and rock fell roughly 1.2 km down the north face of Langtang Lirung. Seismometers recorded it as a magnitude 5.2 event, so large it was first logged as an earthquake. Nepal’s hydrology department says heavy rain was not the trigger.',
    facts: [['Time', '08:37 Nepal time'], ['Seismic signal', 'Ms 5.2 (USGS)'], ['Images', 'Sentinel-2, 15 Dec 2025 and 28 Sep 2026']] },
  { kicker: '08:44 · Seven minutes', title: 'The debris flow hits Gyirong Port', view: { longitude: 85.42, latitude: 28.245, zoom: 10.4 }, t: T0, play: [T0, mins('08:52')],
    body: 'CCTV at Gyirong Port on the border showed the debris flow arriving at 08:44. It covered 20 km in about seven minutes, close to 180 km/h. At 08:40 the Rasuwagadhi river gauge read 1.62 m and calm. It was destroyed before its next reading.',
    facts: [['Speed', 'about 180 km/h'], ['Rasuwagadhi gauge', '1.62 m, then destroyed'], ['Hit', 'Customs complex, friendship bridge, three police posts']] },
  { kicker: '08:50 to 09:20 · Gauges go dark', title: 'Every gauge dies reading normal', view: { longitude: 85.27, latitude: 28.07, zoom: 9.6 }, t: mins('08:52'), play: [mins('08:52'), mins('09:35')],
    body: 'Syabrubesi stopped at 08:50 showing 3.8 m. Betrawati stopped at 09:20 showing 3.55 m. Both were below their alert levels when they died, so the network never raised an alarm. The forecasting office heard about the flood by phone from Dhunche at 09:00. At 09:15 an SMS went to 679,295 people along the river, and a school principal in Bidur moved 1,643 students out before the water came.',
    facts: [['Syabrubesi', '3.8 m, offline 08:50'], ['Betrawati', '3.55 m (warning 4.1 m), offline 09:20'], ['SMS alert', '09:15, 679,295 phones']] },
  { kicker: '11:20 · First alarm', title: 'Malekhu rises 4 m in ten minutes', view: { longitude: 84.98, latitude: 27.86, zoom: 9.6 }, t: mins('09:35'), play: [mins('09:35'), mins('11:50')],
    body: 'The first threshold crossed anywhere on the network was at Malekhu at 11:20, almost three hours after the collapse. The river rose almost 4 m between two 10-minute readings. At 11:43 the station and the Phurke bridge were swept away.',
    facts: [['First alert', '11:20, 2 h 43 min after the collapse'], ['Rise', 'almost 4 m in 10 minutes'], ['Gauges lost', '4 between Rasuwa and Chitwan']] },
  { kicker: '16:00 · Devghat', title: 'The last gauge stays green', view: { longitude: 84.62, latitude: 27.79, zoom: 9.4 }, t: mins('11:50'), play: [mins('11:50'), TEND],
    body: 'The surge passed Mugling by 13:00 and reached Devghat at 15:20, where the Trishuli meets the Kali Gandaki to form the Narayani. Devghat peaked at 6.57 m at 16:00, under its 7.3 m amber level, so the last gauge on the river never went past green. About 20 million m³ of extra water went through.',
    facts: [['Arrived', '15:20, 6 h 43 min after the collapse'], ['Peak', '6.57 m at 16:00 (amber 7.3 m)'], ['Extra water', 'about 20 million m³']] },
  { kicker: 'What the forecasts saw', title: 'The river models saw nothing', view: 'fit', t: TEND, chart: true,
    body: 'GloFAS, the global river forecast that JalNetra and many flood tools read, is driven by rain. It shows no flood on 26 August at all: the upper Trishuli stays near 135 m³/s and Devghat even dips. A system that only reads forecasts would have stayed silent while this happened.',
    facts: [['Source', 'GloFAS v4 via Open-Meteo, daily'], ['Why', 'A glacier collapse is not in a rain-driven model']] },
  { kicker: 'Into India', title: 'The Gandak at Valmikinagar', view: 'india', t: TEND, india: true,
    body: `The Narayani becomes the Gandak at Valmikinagar barrage, ${Math.round(VALM)} km from the glacier. Maharajganj and Kushinagar went on high alert, all 36 barrage gates were opened and loudspeakers warned riverside villages. Bodies from the flood were recovered in Maharajganj in the days after. The dots are low-lying villages within 3 km of the river here.`,
    facts: [['Barrage flow', '1.04 to 1.42 lakh cusecs, 8 to 10 pm (PTI)'], ['Low villages', `${A.villages.length} within 3 km, under 4 m above the river`], ['On alert', 'Maharajganj and Kushinagar (UP)']] },
  { kicker: 'What JalNetra changes', title: 'A silent gauge is the alarm', view: 'fit', t: TEND, end: true,
    body: 'Three gauges going dark one after another while reading normal is itself the signal. JalNetra treats a gauge loss or a fast rise as a flood front, moves it down the river and lists every low village below it with a time. Here that front was clear by 08:50, more than six hours before Devghat and 2.5 hours before the first official alarm. An operator approves, and a Hindi call goes to each sarpanch.',
    facts: [['Front detected', '08:50 (Syabrubesi offline)'], ['Official first alarm', '11:20 (Malekhu)'], ['Lead time to Devghat', 'about 6 h 30 min']] },
]

function Chart() {
  const g = A.glofas, i26 = g.days.indexOf('2026-08-26')
  const line = (q: number[], w: number, h: number) => { const lo = Math.min(...q) * 0.9, hi = Math.max(...q) * 1.1; return q.map((v, i) => `${(i / (q.length - 1)) * w},${h - ((v - lo) / (hi - lo)) * h}`).join(' ') }
  const row = (label: string, q: number[]) => (
    <div className="augchart">
      <div className="aclab"><span>{label}</span><b>{q[i26].toLocaleString()} m³/s on 26 Aug</b></div>
      <svg viewBox="0 0 360 60" preserveAspectRatio="none" role="img" aria-label={`${label} GloFAS flow, 18 Aug to 8 Sep`}>
        <line x1={(i26 / (q.length - 1)) * 360} x2={(i26 / (q.length - 1)) * 360} y1="0" y2="60" className="acmark" />
        <polyline points={line(q, 360, 56)} fill="none" className="acline" />
      </svg>
    </div>
  )
  return <div className="augcharts">{row('Upper Trishuli', g.trishuli)}{row('Devghat (Narayani)', g.devghat)}<div className="acfoot"><span>18 Aug</span><span>line: 26 Aug</span><span>8 Sep</span></div></div>
}

export default function Story({ onHome, onRivers, onLive }: { onHome: () => void; onRivers: () => void; onLive: () => void }) {
  const [step, setStep] = useState(0)
  const [t, setT] = useState(STEPS[0].t)
  const [playing, setPlaying] = useState(false)
  const [img, setImg] = useState<'before' | 'after'>('after')
  const [view, setView] = useState<MapViewState>({ longitude: 84.7, latitude: 27.65, zoom: 7.6 })
  const panel = useRef<HTMLDivElement>(null)
  const playTo = useRef(0)

  const fit = (b: [number, number, number, number]) => {
    const w = innerWidth, left = w > 760 ? 470 : 20
    const v = new WebMercatorViewport({ width: w, height: innerHeight }).fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: { left, right: 40, top: 40, bottom: w > 760 ? 40 : innerHeight * 0.55 } })
    return { longitude: v.longitude, latitude: v.latitude, zoom: v.zoom }
  }
  const go = (k: number) => {
    const s = STEPS[k]; setStep(k); setT(s.t); setPlaying(false)
    const v = s.view === 'fit' ? fit([83.85, 27.15, 85.6, 28.36]) : s.view === 'india' ? fit([83.75, 26.82, 84.45, 27.62]) : { pitch: 0, bearing: 0, ...s.view }
    setView(x => ({ ...x, ...v, transitionDuration: 1600, transitionInterpolator: new FlyToInterpolator({ speed: 1.6 }) } as any))
    if (s.images) setImg('before')
    if (s.play) { playTo.current = s.play[1]; setTimeout(() => setPlaying(true), 1700) }
    if (s.images) setTimeout(() => setImg('after'), 2600)
  }
  useEffect(() => { go(0) }, [])
  useEffect(() => { if (panel.current) gsap.fromTo(panel.current.querySelectorAll('.anim'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: 'power2.out' }) }, [step])
  // playback: one minute of the flood per 40 ms, faster in the long middle reach
  useEffect(() => {
    if (!playing) return
    let last = performance.now(), id = 0
    const span = playTo.current - STEPS[step].t, rate = span / 7000
    const tick = (now: number) => { const dt = (now - last) * rate; last = now; setT(x => { const n = x + dt; if (n >= playTo.current) { setPlaying(false); return playTo.current } return n }); id = requestAnimationFrame(tick) }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [playing, step])

  const S = STEPS[step]
  const wk = S.india || S.end ? VALM : waveKm(t)
  const layers = useMemo(() => {
    const L: any[] = [
      new GeoJsonLayer({ id: 'countries', data: countries as any, filled: true, stroked: true, getFillColor: [16, 19, 24], getLineColor: [70, 78, 92], lineWidthMinPixels: 1 }),
      new BitmapLayer({ id: 'valley', image: valley, bounds: A.img.valley as any }),
      new BitmapLayer({ id: 's2', image: s2, bounds: S2B }),
    ]
    if (S.images || step <= 2) L.push(new BitmapLayer({ id: 'src-img', image: img === 'after' ? after : before, bounds: A.img.after as any, opacity: S.images ? 1 : 0.85 }))
    L.push(new PathLayer({ id: 'river', data: [PATH], getPath: (d: any) => d, getColor: [125, 211, 252, 90], widthUnits: 'pixels', getWidth: 2.5, capRounded: true, jointRounded: true }))
    const wet = upTo(wk)
    if (wet.length > 1) {
      L.push(new PathLayer({ id: 'surge-glow', data: [wet], getPath: (d: any) => d, getColor: [56, 189, 248, 70], widthUnits: 'pixels', getWidth: 12, capRounded: true, jointRounded: true }))
      L.push(new PathLayer({ id: 'surge', data: [wet], getPath: (d: any) => d, getColor: [186, 230, 253, 255], widthUnits: 'pixels', getWidth: 4, capRounded: true, jointRounded: true }))
    }
    if (!S.india && !S.end && t >= T0 && wk < WAVE[WAVE.length - 1][1]) L.push(new ScatterplotLayer({ id: 'front', data: [ptAt(wk)], getPosition: (d: any) => d, getRadius: 11, radiusUnits: 'pixels', filled: false, stroked: true, getLineColor: [255, 255, 255, 240], lineWidthMinPixels: 2.5 }))
    const gState = (id: string) => { const g = GAUGE_T[id]; return g.off !== undefined && t >= g.off ? 'off' : g.alert !== undefined && t >= g.alert ? 'alert' : 'on' }
    L.push(new ScatterplotLayer({ id: 'gauges', data: G, getPosition: (d: any) => [d.lng, d.lat], radiusUnits: 'pixels', getRadius: 6, stroked: true, lineWidthMinPixels: 2,
      getFillColor: (d: any) => (gState(d.id) === 'off' ? [30, 34, 40] : gState(d.id) === 'alert' ? [245, 158, 11] : [255, 255, 255]), getLineColor: (d: any) => (gState(d.id) === 'off' ? [120, 128, 140] : [12, 14, 18]), updateTriggers: { getFillColor: t, getLineColor: t } }))
    L.push(new TextLayer({ id: 'glabels', data: G, getPosition: (d: any) => [d.lng, d.lat], getText: (d: any) => `${d.name} gauge${gState(d.id) === 'off' ? ' · offline' : gState(d.id) === 'alert' ? ' · alert' : ''}`, getSize: 12.5, getPixelOffset: (d: any) => (d.id === 'gy' ? [-12, 0] : [12, 0]), getTextAnchor: (d: any) => (d.id === 'gy' ? 'end' : 'start'),
      getColor: (d: any) => (gState(d.id) === 'off' ? [160, 168, 180] : [255, 255, 255]), fontFamily: FONT, fontWeight: 600, outlineWidth: 4, outlineColor: [0, 0, 0, 220], fontSettings: { sdf: true }, characterSet: 'auto', updateTriggers: { getText: t, getColor: t } }))
    const named = A.places.filter(p => ['src', 'mu', 'vb'].includes(p.id))
    L.push(new ScatterplotLayer({ id: 'places', data: named, getPosition: (d: any) => [d.lng, d.lat], radiusUnits: 'pixels', getRadius: 4, getFillColor: [125, 211, 252] }))
    L.push(new TextLayer({ id: 'plabels', data: named, getPosition: (d: any) => [d.lng, d.lat], getText: (d: any) => d.name, getSize: 13, getPixelOffset: [0, -16], getAlignmentBaseline: 'bottom', fontFamily: FONT, fontWeight: 650, getColor: [255, 255, 255], outlineWidth: 4, outlineColor: [0, 0, 0, 220], fontSettings: { sdf: true }, characterSet: 'auto' }))
    if (S.india) {
      L.push(new ScatterplotLayer({ id: 'villages', data: A.villages, getPosition: (d: any) => [d.lng, d.lat], radiusUnits: 'pixels', getRadius: 6, getFillColor: [245, 158, 11], stroked: true, getLineColor: [12, 14, 18], lineWidthMinPixels: 1.5, pickable: true }))
      L.push(new TextLayer({ id: 'vlabels', data: A.villages.filter((_, i) => i % 3 === 0), getPosition: (d: any) => [d.lng, d.lat], getText: (d: any) => d.n, getSize: 11.5, getPixelOffset: [9, 0], getTextAnchor: 'start', fontFamily: FONT, fontWeight: 600, getColor: [253, 230, 138], outlineWidth: 4, outlineColor: [0, 0, 0, 220], fontSettings: { sdf: true }, characterSet: 'auto' }))
    }
    return L
  }, [t, img, step, wk])

  return (
    <div className="app">
      <DeckGL viewState={view} onViewStateChange={(e: any) => setView(e.viewState)} controller={true} layers={layers}
        getTooltip={({ object, layer }: any) => object && layer?.id === 'villages' ? { text: `${object.n} · ${object.dr} km from the river, about ${object.h} m above it` } : null} />
      <aside className="story" ref={panel}>
        <div className="sprog">{STEPS.map((_, k) => <button key={k} aria-label={`Go to step ${k + 1}`} className={k <= step ? 'on' : ''} onClick={() => go(k)} />)}</div>
        <div className="kicker anim">{S.kicker}</div>
        <h2 className="anim">{S.title}</h2>
        <p className="sbody anim">{S.body}</p>
        {S.images && <div className="seg anim augseg" aria-label="Satellite image"><button className={img === 'before' ? 'on' : ''} onClick={() => setImg('before')}>15 Dec 2025</button><button className={img === 'after' ? 'on' : ''} onClick={() => setImg('after')}>28 Sep 2026</button></div>}
        {S.facts && <dl className="kv sfacts anim">{S.facts.map(([k, v]) => <div key={k} className="frow"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
        {S.chart && <div className="anim"><Chart /></div>}
        <div className="sdate">26 Aug 2026 · {hhmm(S.india || S.end ? TEND : Math.max(t, T0 - 1))} Nepal time{playing ? ' · playing' : ''}
          {S.play && !playing && <button className="link replay" onClick={() => { setT(S.t); playTo.current = S.play![1]; setPlaying(true) }}><FiPlay /> Replay</button>}</div>
        <div className="snav">
          <button onClick={() => (step === 0 ? onHome() : go(step - 1))}><FiArrowLeft /> Back</button>
          {step < STEPS.length - 1 ? <button className="primary" onClick={() => go(step + 1)}>Next <FiArrowRight /></button> : <button className="primary" onClick={onRivers}><FiActivity /> Rivers of India, live</button>}
        </div>
        {S.end && <><button className="link" onClick={onLive}>Gandak village model</button><button className="link" onClick={() => go(0)}>Replay the story</button></>}
        <div className="lsrc">Timeline: Nepal DHM Flood Forecasting Division, Nepali Times, USGS, PTI. Images: Sentinel-2 (ESA Copernicus). River: traced on Copernicus DEM.</div>
      </aside>
    </div>
  )
}
