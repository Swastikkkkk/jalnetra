import { useEffect, useState } from 'react'
import App from './App'
import Home from './live/Home'
import Live from './live/Live'
import Validate from './live/Validate'
import RiverWatch from './live/RiverWatch'
import Story from './live/Story'

type Screen = { s: 'home' } | { s: 'rivers' } | { s: 'live'; mode: 'live' | 'demo' } | { s: 'validate' } | { s: 'story' } | { s: 'history'; start: 'story' | 'explore' | 'ops'; incident?: string | null }
const parse = (): Screen => {
  const h = location.hash.replace('#', '')
  if (h === 'rivers') return { s: 'rivers' }
  if (h === 'live') return { s: 'live', mode: 'live' }
  if (h === 'demo') return { s: 'live', mode: 'demo' }
  if (h === 'validate') return { s: 'validate' }
  if (h === 'story') return { s: 'story' }
  if (h === 'explore') return { s: 'history', start: 'explore' }
  if (h.startsWith('ops')) return { s: 'history', start: 'ops', incident: h.split('/')[1] ?? null }
  // The glacier-collapse story is the clearest first-time pitch: it starts at
  // the source, shows the gauges going offline, and ends at India. Keep the
  // live home dashboard available at #home, but make the story the default.
  return { s: 'story' }
}
const hashOf = (x: Screen) => (x.s === 'home' ? '' : x.s === 'rivers' ? 'rivers' : x.s === 'live' ? x.mode : x.s === 'validate' ? 'validate' : x.s === 'story' ? 'story' : x.start === 'ops' ? `ops${x.incident ? '/' + x.incident : ''}` : x.start)

/** Screens: home (live status), live console (live or demo simulation), 2026 validation, and the historical story / incidents. */
export default function Root() {
  const [scr, setScr] = useState<Screen>(parse)
  useEffect(() => { const f = () => setScr(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const go = (x: Screen) => { location.hash = hashOf(x); setScr(x) }
  const home = () => go({ s: 'home' }), live = () => go({ s: 'live', mode: 'live' }), validate = () => go({ s: 'validate' })
  if (scr.s === 'rivers') return <RiverWatch onHome={home} onGandak={live} onDemo={() => go({ s: 'live', mode: 'demo' })} />
  if (scr.s === 'story') return <Story onHome={home} onRivers={() => go({ s: 'rivers' })} onLive={live} />
  if (scr.s === 'home') return <Home onRivers={() => go({ s: 'rivers' })} onLive={live} onDemo={() => go({ s: 'live', mode: 'demo' })} onValidate={validate} onOps={() => go({ s: 'history', start: 'ops' })} onStory={() => go({ s: 'story' })} />
  if (scr.s === 'live') return <Live key="live" mode={scr.mode} onMode={m => go({ s: 'live', mode: m })} onHome={home} onValidate={validate} onOpenIncident={id => go({ s: 'history', start: 'ops', incident: id })} />
  if (scr.s === 'validate') return <Validate onBack={home} onLive={live} onStory={() => go({ s: 'story' })} />
  return <App key={scr.start + (scr.incident ?? '')} start={scr.start} incidentId={scr.incident ?? null} onHome={home} onValidate={validate} onLive={live} />
}
