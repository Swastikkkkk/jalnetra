import { MdWaves } from 'react-icons/md'

/** The JalNetra mark, shown top-left on every screen. Clicking it always returns to the home page. */
export function AppBrand({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return <button className={`app-brand ${className}`} onClick={onClick} aria-label="JalNetra, go to home"><MdWaves /><b>JalNetra</b></button>
}
