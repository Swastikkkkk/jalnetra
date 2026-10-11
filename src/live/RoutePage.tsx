import { useEffect, useMemo, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { type MapViewState } from '@deck.gl/core'
import { BitmapLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import { TileLayer } from '@deck.gl/geo-layers'
import { FiCamera, FiCopy, FiExternalLink, FiNavigation } from 'react-icons/fi'
import { AppBrand } from '../components/AppBrand'
import { decodeRoute, mapsLink } from './routeShare'
import { ArView } from './ArView'
import { FONT } from './shared'
import { hindiRouteLine, walkingRoute, type Walk } from './aws'
import { ListenButton, WalkSteps } from './AwsTools'

const latin = (s: string) => /^[\x20-\x7EÀ-ɏ]+$/.test(s)

/** The page a village head opens from the Telegram message: the predicted evacuation route on a 3D map, plus an AR view on a phone. */
export default function RoutePage({ onHome }: { onHome: () => void }) {
  const route = useMemo(() => decodeRoute(new URLSearchParams(location.search).get('d')), [])
  const [ar, setAr] = useState(false)
  const [copied, setCopied] = useState(false)
  const [walk, setWalk] = useState<Walk | null>(null)
  const [walkErr, setWalkErr] = useState('')
  const [walkBusy, setWalkBusy] = useState(false)
  useEffect(() => {
    if (!route) return
    setWalkBusy(true)
    walkingRoute(route.from, route.to).then(setWalk).catch(e => setWalkErr((e as Error).message)).finally(() => setWalkBusy(false))
  }, [route])
  const view: MapViewState = useMemo(() => {
    const lats = route ? [route.from[0], route.to[0]] : [26.8], lngs = route ? [route.from[1], route.to[1]] : [84.5]
    const lat = (Math.min(...lats) + Math.max(...lats)) / 2, lng = (Math.min(...lngs) + Math.max(...lngs)) / 2
    const span = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs), 0.004)
    return { latitude: lat, longitude: lng, zoom: Math.max(9, Math.min(15.5, Math.log2(0.9 / span) + 7.3)), pitch: 55, bearing: -15 }
  }, [route])

  if (!route) {
    return (
      <main className="route-page">
        <header className="route-top"><AppBrand onClick={onHome} /></header>
        <section className="route-card"><h1>This route link is not valid</h1><p>Ask the operator to send the evacuation route again from the JalNetra live map.</p></section>
      </main>
    )
  }
  const layers = [
    new TileLayer({ id: 'base', data: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', minZoom: 0, maxZoom: 17, tileSize: 256,
      renderSubLayers: (p: any) => { const b = p.tile.boundingBox; return new BitmapLayer(p, { data: undefined, image: p.data, bounds: [b[0][0], b[0][1], b[1][0], b[1][1]] }) } }),
    ...(walk ? [new PathLayer({ id: 'walk', data: [{ path: walk.path }], getPath: (d: any) => d.path, getColor: [96, 200, 255, 230], getWidth: 3, widthUnits: 'pixels', capRounded: true })] : []),
    new PathLayer({ id: 'glow', data: [{ path: route.path }], getPath: (d: any) => d.path, getColor: [6, 20, 16, 210], getWidth: 9, widthUnits: 'pixels', capRounded: true, jointRounded: true }),
    new PathLayer({ id: 'route', data: [{ path: route.path }], getPath: (d: any) => d.path, getColor: [52, 211, 153, 255], getWidth: 5, widthUnits: 'pixels', capRounded: true, jointRounded: true }),
    new ScatterplotLayer({ id: 'pts', data: [{ p: [route.from[1], route.from[0]], c: [217, 138, 24], t: route.v }, { p: [route.to[1], route.to[0]], c: [52, 211, 153], t: route.shelter }], getPosition: (d: any) => d.p, getRadius: 9, radiusUnits: 'pixels', getFillColor: (d: any) => d.c, stroked: true, getLineColor: [255, 255, 255], lineWidthMinPixels: 2 }),
    new TextLayer({ id: 'lbl', data: [{ p: [route.from[1], route.from[0]], t: route.v }, { p: [route.to[1], route.to[0]], t: latin(route.shelter) ? route.shelter : 'Safe place' }], getPosition: (d: any) => d.p, getText: (d: any) => d.t, getSize: 14, getPixelOffset: [0, -22], getTextAnchor: 'middle', getColor: [13, 25, 18], background: true, getBackgroundColor: [252, 253, 250, 235], backgroundPadding: [6, 3], fontFamily: FONT, fontWeight: 650, characterSet: 'auto', fontSettings: { sdf: true } }),
  ]
  const copy = async () => { try { await navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* clipboard unavailable */ } }
  return (
    <main className="route-page">
      <header className="route-top"><AppBrand onClick={onHome} />{route.ex && <span className="pill sim">EXERCISE · not a real alert</span>}</header>
      <section className="route-head">
        <p className="eyebrow">Evacuation route</p>
        <h1>{route.v}{route.d ? `, ${route.d}` : ''}</h1>
        <p className="route-sub">Go to <b>{route.shelter}</b>, {route.km.toFixed(1)} km away{route.when ? ` · impact ${route.when}` : ''} · risk {route.lvl}</p>
      </section>
      <div className="route-map">
        <DeckGL initialViewState={view} controller layers={layers} getCursor={() => 'grab'} />
        <div className="map-attr" style={{ bottom: 6 }}>Imagery © Esri, Maxar · route predicted by JalNetra</div>
      </div>
      <div className="route-actions">
        <button className="route-btn primary" onClick={() => setAr(true)}><FiCamera /> Open AR view (phone)</button>
        <a className="route-btn" href={mapsLink(route)} target="_blank" rel="noreferrer"><FiNavigation /> Walk it in Google Maps <FiExternalLink /></a>
        <button className="route-btn" onClick={() => void copy()}><FiCopy /> {copied ? 'Link copied' : 'Copy link'}</button>
        <ListenButton text={hindiRouteLine(route)} />
      </div>
      <WalkSteps walk={walk} loading={walkBusy} error={walkErr} />
      <p className="route-note">{route.ex ? 'This is a rehearsal. ' : ''}The route is a prediction from river, rain and terrain data, issued {new Date(route.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}. Follow instructions from local authorities. Not an official evacuation order.</p>
      {ar && <ArView route={route} onClose={() => setAr(false)} />}
    </main>
  )
}
