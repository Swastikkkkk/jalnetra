import { useEffect, useState } from 'react'
import App from './App'
import Home from './live/Home'
import Live from './live/Live'
import Validate from './live/Validate'

type Screen = { s: 'home' } | { s: 'live'; mode: 'live' | 'demo' } | { s: 'validate' } | { s: 'history'; start: 'story' | 'explore' | 'ops'; incident?: string | null }
const parse = (): Screen => {
  const h = location.hash.replace('#', '')
  if (h === 'live') return { s: 'live', mode: 'live' }
  if (h === 'demo') return { s: 'live', mode: 'demo' }
  if (h === 'validate') return { s: 'validate' }
  if (h === 'story') return { s: 'history', start: 'story' }
  if (h === 'explore') return { s: 'history', start: 'explore' }
  if (h.startsWith('ops')) return { s: 'history', start: 'ops', incident: h.split('/')[1] ?? null }
  return { s: 'home' }
}
const hashOf = (x: Screen) => (x.s === 'home' ? '' : x.s === 'live' ? x.mode : x.s === 'validate' ? 'validate' : x.start === 'ops' ? `ops${x.incident ? '/' + x.incident : ''}` : x.start)

/** Screens: home (live status), live console (live or demo simulation), 2026 validation, and the historical story / incidents. */
export default function Root() {
  const [scr, setScr] = useState<Screen>(parse)
  useEffect(() => { const f = () => setScr(parse()); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  const go = (x: Screen) => { location.hash = hashOf(x); setScr(x) }
  const home = () => go({ s: 'home' }), live = () => go({ s: 'live', mode: 'live' }), validate = () => go({ s: 'validate' })
  if (scr.s === 'home') return <Home onLive={live} onDemo={() => go({ s: 'live', mode: 'demo' })} onValidate={validate} onOps={() => go({ s: 'history', start: 'ops' })} onStory={() => go({ s: 'history', start: 'story' })} />
  if (scr.s === 'live') return <Live key="live" mode={scr.mode} onMode={m => go({ s: 'live', mode: m })} onHome={home} onValidate={validate} onOpenIncident={id => go({ s: 'history', start: 'ops', incident: id })} />
  if (scr.s === 'validate') return <Validate onBack={home} onLive={live} onStory={() => go({ s: 'history', start: 'story' })} />
  return <App key={scr.start + (scr.incident ?? '')} start={scr.start} incidentId={scr.incident ?? null} onHome={home} onValidate={validate} onLive={live} />
}
