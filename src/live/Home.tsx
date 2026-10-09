import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { FiArrowRight, FiActivity, FiPlayCircle, FiClock, FiList, FiRefreshCw } from 'react-icons/fi'
import s2 from '../img/s2.jpg'
import { runModel, type ModelRun } from '../engine/core'
import { liveInputs } from '../engine/sources'
import { M, fmtIST } from './shared'

export default function Home({ onLive, onDemo, onValidate, onOps, onStory }: { onLive: () => void; onDemo: () => void; onValidate: () => void; onOps: () => void; onStory: () => void }) {
  const [run, setRun] = useState<ModelRun | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => { liveInputs(M).then(i => setRun(runModel(M, i))).catch(e => setErr(String(e.message ?? e))) }, [])
  useEffect(() => { if (root.current) gsap.from(root.current.querySelectorAll('.rv'), { y: 14, opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out' }) }, [])
  useEffect(() => { if (run && root.current) gsap.from(root.current.querySelectorAll('.hstat'), { y: 8, opacity: 0, duration: 0.5, stagger: 0.06 }) }, [run])
  const c0 = run ? run.counts[0] : null, c6 = run ? run.counts[6] : null
  const n = (c: ModelRun['counts'][number] | null) => (c ? c.MEDIUM + c.HIGH + c.CRITICAL : 0)
  const next6 = !run ? '' : n(c6) > n(c0) ? 'EXPANDING FLOOD RISK' : run.atRisk > 0 ? 'RISK HOLDING' : 'NO FLOODING PREDICTED'
  const crit = run ? run.villages.filter(v => v.level === 'CRITICAL').length : 0
  return (
    <div className="home" ref={root} style={{ backgroundImage: `url(${s2})` }}>
      <div className="hwrap">
        <div className="hl">
          <div className="eyebrow rv">JalNetra</div>
          <h1 className="rv">Live flood intelligence</h1>
          <p className="tag rv">Predicting where the water goes before it gets there.</p>
          <p className="sub rv">JalNetra watches the Gandak from Nepal to the Ganga: river flow, rain in the hills and the land itself. It predicts which of 291 villages will flood, when, and the safe road out. An operator approves every alert before a Hindi AI call reaches the sarpanch.</p>
          <div className="hbtns rv">
            <button className="primary" onClick={onLive}><FiActivity /> Explore live prediction</button>
            <button onClick={onDemo}><FiPlayCircle /> Run live demo simulation</button>
            <button onClick={onValidate}><FiClock /> View 2026 validation</button>
          </div>
          <div className="hlinks rv"><button className="link" onClick={onStory}>Story of the 2026 flood</button><button className="link" onClick={onOps}><FiList /> Incidents</button></div>
          <div className="flow rv">DETECT <FiArrowRight /> PREDICT <FiArrowRight /> WARN <FiArrowRight /> EVACUATE <FiArrowRight /> VERIFY</div>
        </div>
        <div className="hr rv">
          <div className="kicker live">Current risk · Gandak basin</div>
          {!run && !err && <p className="note"><FiRefreshCw className="spin" /> Fetching GloFAS river flow and Open-Meteo rain, running the model…</p>}
          {err && <p className="note">Live sources are unreachable right now ({err}). JalNetra shows nothing rather than a guess. The demo simulation works offline.</p>}
          {run && <>
            <div className="hstat"><span>River</span><b className={run.river.startsWith('Rising') ? 'warn' : ''}>{run.river.toUpperCase()}</b></div>
            <div className="hstat"><span>Rain (Nepal, 48 h + forecast)</span><b className={run.rainLevel === 'HIGH' ? 'warn' : ''}>{run.rainLevel}</b></div>
            <div className="hstat"><span>Villages at risk (24 h)</span><b>{run.atRisk} <small>/ 291</small></b></div>
            <div className="hstat"><span>Critical</span><b className={crit ? 'crit' : ''}>{crit}</b></div>
            <div className="hstat"><span>Next 6 hours</span><b className={next6.startsWith('EXP') ? 'warn' : ''}>{next6}</b></div>
            <div className="hsrc">Model run {fmtIST(run.at)} · GloFAS v4 + Open-Meteo, LIVE</div>
          </>}
        </div>
      </div>
    </div>
  )
}
