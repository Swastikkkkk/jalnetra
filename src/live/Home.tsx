import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { FiArrowRight, FiActivity, FiPlayCircle, FiClock, FiList, FiRefreshCw } from 'react-icons/fi'
import s2 from '../img/s2.jpg'
import { fmtIST } from './shared'

type Pub = { river: { created_at: string; points: number; normal: number; rising: number; warning: number; danger: number; headline: string; flagged: { river: string; near: string; status: string; trend?: string }[] } | null; gandak: { created_at: string; river: string; at_risk: number; overall: string } | null }
export default function Home({ onRivers, onLive, onDemo, onValidate, onOps, onStory }: { onRivers: () => void; onLive: () => void; onDemo: () => void; onValidate: () => void; onOps: () => void; onStory: () => void }) {
  const [pub, setPub] = useState<Pub | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { fetch('https://oceaylrebzflgyxfjqfb.supabase.co/functions/v1/jalnetra-public').then(r => r.json()).then(setPub).catch(e => setErr(String(e.message ?? e))) }, [])
  useEffect(() => { if (root.current) gsap.from(root.current.querySelectorAll('.rv'), { y: 14, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out' }) }, [])
  const R = pub?.river, G = pub?.gandak
  const attention = R ? [...new Map(R.flagged.filter(f => f.status !== 'RISING').sort((a, b) => (b.trend === 'rising' ? 1 : 0) - (a.trend === 'rising' ? 1 : 0)).map(f => [f.river, f])).values()].slice(0, 3) : []
  return (
    <div className="home" ref={root} style={{ backgroundImage: `url(${s2})` }}>
      <div className="hwrap">
        <div className="hl">
          <div className="eyebrow rv">JalNetra</div>
          <h1 className="rv">Live flood intelligence</h1>
          <p className="tag rv">Predicting where the water goes before it gets there.</p>
          <p className="sub rv">Every few hours JalNetra checks the river forecast for India's major rivers. When a river is heading above its usual monsoon highs, it lists the low-lying villages nearby, and an operator approves a Hindi AI call to the sarpanch.</p>
          <div className="hbtns rv">
            <button className="primary" onClick={onRivers}><FiActivity /> Rivers of India, live</button>
            <button onClick={onLive}>Gandak village model</button>
            <button onClick={onDemo}><FiPlayCircle /> Replay the Gandak flood</button>
          </div>
          <div className="hlinks rv"><button className="link" onClick={onValidate}><FiClock /> 2026 validation</button><button className="link" onClick={onStory}>Story: the August 2026 glacier flood</button><button className="link" onClick={onOps}><FiList /> Incidents</button></div>
          <div className="flow rv">DETECT <FiArrowRight /> PREDICT <FiArrowRight /> WARN <FiArrowRight /> EVACUATE <FiArrowRight /> VERIFY</div>
        </div>
        <div className="hr rv">
          <div className="kicker live">Right now</div>
          {!pub && !err && <p className="note"><FiRefreshCw className="spin" /> Loading the latest scan…</p>}
          {err && <p className="note">Could not reach the JalNetra monitor ({err}).</p>}
          {R && <>
            <div className={'rwhead ' + (R.flagged.some(f => f.trend === 'rising' && f.status === 'DANGER') ? 'DANGER' : R.flagged.some(f => f.trend === 'rising' && f.status === 'WARNING') ? 'WARNING' : R.rising ? 'RISING' : 'NORMAL')} style={{ marginTop: 8 }}>{R.headline}</div>
            <p className="rwsub">{R.points} river points across India checked {fmtIST(R.created_at)}.</p>
            {attention.length > 0 && <ul className="reasons">{attention.map(f => <li key={f.river + f.near}><b>{f.river}</b> near {f.near}: {f.trend === 'rising' ? 'rising to flood level' : `high, ${f.trend ?? 'steady'}`}</li>)}</ul>}
          </>}
          {G && <div className="hstat"><span>Gandak, 291 villages modelled</span><b>{G.at_risk ? `${G.at_risk} at risk` : 'No risk'}</b></div>}
        </div>
      </div>
    </div>
  )
}
