import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { FiArrowRight, FiActivity, FiPlayCircle, FiClock, FiList, FiRefreshCw } from 'react-icons/fi'
import { fmtIST } from './shared'

type Pub = { river: { created_at: string; points: number; normal: number; rising: number; warning: number; danger: number; headline: string; flagged: { river: string; near: string; status: string; trend?: string }[] } | null; gandak: { created_at: string; river: string; at_risk: number; overall: string } | null }
export default function Home({ onRivers, onLive, onDemo, onValidate, onOps, onStory }: { onRivers: () => void; onLive: () => void; onDemo: () => void; onValidate: () => void; onOps: () => void; onStory: () => void }) {
  const [pub, setPub] = useState<Pub | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { fetch('https://oceaylrebzflgyxfjqfb.supabase.co/functions/v1/jalnetra-public').then(r => r.json()).then(setPub).catch(e => setErr(String(e.message ?? e))) }, [])
  useEffect(() => { if (!root.current) return; const ctx = gsap.context(() => { gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => gsap.from('.rv', { y: 14, opacity: 0, duration: .65, stagger: .07, ease: 'power2.out' })) }, root); return () => ctx.revert() }, [])
  const R = pub?.river, G = pub?.gandak
  const attention = R ? [...new Map(R.flagged.filter(f => f.status !== 'RISING').sort((a, b) => (b.trend === 'rising' ? 1 : 0) - (a.trend === 'rising' ? 1 : 0)).map(f => [f.river, f])).values()].slice(0, 3) : []
  return (
    <div className="home" ref={root}>
      <div className="hwrap">
        <header className="home-nav rv"><b>JalNetra</b><span>Early warning, with a human in the loop.</span><nav><button onClick={onRivers}>Rivers</button><button onClick={onLive}>Live</button><button onClick={onDemo}>Demo</button></nav></header>
        <main className="hl">
          <div className="eyebrow rv">Flood intelligence for the last mile</div>
          <h1 className="rv">Upstream signals.<br />Earlier village warnings.</h1>
          <p className="tag rv">Predicting where the water goes before it gets there.</p>
          <p className="sub rv">JalNetra watches river forecasts, finds exposed villages, and prepares a clear Hindi warning for an operator to approve.</p>
          <div className="hbtns rv"><button className="primary" onClick={onStory}><FiPlayCircle /> Watch the glacier story</button><button onClick={onLive}><FiActivity /> See Gandak live</button></div>
          <div className="flow rv"><span><b>01</b> DETECT</span><FiArrowRight /><span><b>02</b> PREDICT</span><FiArrowRight /><span><b>03</b> APPROVE</span></div>
          <div className="operator-guard rv"><strong>Human approval is the safeguard.</strong><span>No automatic calls are placed. An operator reviews every alert before a Hindi call can go out.</span></div>
          <div className="hlinks rv"><button className="link" onClick={onValidate}><FiClock /> Validation</button><button className="link" onClick={onOps}><FiList /> Operations</button></div>
        </main>
        <div className="hr rv">
            <div className="kicker live">Public monitor · right now</div>
          {!pub && !err && <p className="note"><FiRefreshCw className="spin" /> Loading the latest scan…</p>}
          {err && <p className="note">Could not reach the JalNetra monitor ({err}).</p>}
          {R && <>
            <div className={'rwhead ' + (R.flagged.some(f => f.trend === 'rising' && f.status === 'DANGER') ? 'DANGER' : R.flagged.some(f => f.trend === 'rising' && f.status === 'WARNING') ? 'WARNING' : R.rising ? 'RISING' : 'NORMAL')} style={{ marginTop: 8 }}>{R.headline}</div>
            <p className="rwsub">{R.points} river points across India checked {fmtIST(R.created_at)}.</p>
            {attention.length > 0 && <ul className="reasons">{attention.map(f => <li key={f.river + f.near}><b>{f.river}</b> near {f.near}: {f.trend === 'rising' ? 'rising to flood level' : `high, ${f.trend ?? 'steady'}`}</li>)}</ul>}
          </>}
            {G && <div className="hstat"><span>{G.river} · village model</span><b>{G.at_risk ? `${G.at_risk} at risk` : 'No risk'}</b></div>}
        </div>
      </div>
    </div>
  )
}
