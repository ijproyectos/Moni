import { useId } from 'react'
import { COINS, coinsFor } from './piggyCoins'

/**
 * Moni with its piggy jar (designs/moni_alcancia_estatica.svg, drawn inline so it can move): the jar fills with coins as the goal's
 * percentage grows, and at 100 % Moni celebrates (hops, waves its paw, sparkles) unless the person prefers reduced motion.
 */

function Coin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="16" fill="#F5BC3A" stroke="#244A38" strokeWidth="4.5" />
      <circle cx={x} cy={y} r="10.6" fill="none" stroke="#D18F1B" strokeWidth="2.6" />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontFamily="Arial,Helvetica,sans-serif" fontWeight="800" fontSize="15.2" fill="#D18F1B">$</text>
    </g>
  )
}

export function MoniPiggy({ share, celebrate = false, className }: { share: number; celebrate?: boolean; className?: string } ) {
  const clip = `${useId()}-hc`
  const coins = coinsFor(share)
  const party = celebrate || share >= 1
  return (
    <svg viewBox="0 0 400 450" aria-hidden="true" focusable="false" data-party={party ? 'true' : undefined} className={`moni-piggy ${className ?? ''}`}>
      <defs>
        <clipPath id={clip}>
          <ellipse cx="200" cy="134" rx="100" ry="64" />
          <path d="M296 112 L288 58 Q286 50 279 54 L236 84 Z" />
        </clipPath>
      </defs>
      <g className="mp-all">
        <ellipse cx="200" cy="432" rx="118" ry="11" fill="#17342A" opacity=".16"/>
        <g><path d="M112 276 Q106 222 146 204 L254 204 Q294 222 288 276 Z" fill="none" stroke="#244A38" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round"/><path d="M112 276 Q106 222 146 204 L254 204 Q294 222 288 276 Z" fill="none" stroke="#FBF0D8" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/><path d="M108 272 Q102 220 144 202 L256 202 Q298 220 292 272 Z" fill="#FBF0D8" stroke="none"/></g>
        <g className="mp-arm">
        <path d="M288 262 Q308 244 314 210" fill="none" stroke="#244A38" strokeWidth="31" strokeLinecap="round" strokeLinejoin="round"/><path d="M288 262 Q308 244 314 210" fill="none" stroke="#FBF0D8" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round"/>
        <g><circle cx="314" cy="204" r="17" fill="#244A38"/><circle cx="314" cy="204" r="13.5" fill="#FBF0D8"/><circle cx="314" cy="207" r="4.6" fill="#F2B4B8"/></g>
        </g>
        <path d="M122 200 Q200 226 278 200" fill="none" stroke="#244A38" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round"/><path d="M122 200 Q200 226 278 200" fill="none" stroke="#B5E07A" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="200" cy="226" r="8" fill="#F5BC3A" stroke="#244A38" strokeWidth="4"/>
        <g fill="#244A38" stroke="#244A38" strokeWidth="14" strokeLinejoin="round"><path d="M104 112 L112 58 Q114 50 121 54 L164 84 Z M296 112 L288 58 Q286 50 279 54 L236 84 Z"/><ellipse cx="200" cy="134" rx="100" ry="64"/></g>
        <g fill="#FBF0D8"><path d="M104 112 L112 58 Q114 50 121 54 L164 84 Z M296 112 L288 58 Q286 50 279 54 L236 84 Z"/><ellipse cx="200" cy="134" rx="100" ry="64"/></g>
        <g clipPath={`url(#${clip})`}><path d="M232 60 Q268 58 300 88 Q316 130 286 146 Q276 112 252 100 Q232 90 226 70Z" fill="#B5E07A"/></g>
        <path d="M124 78 L112 60 L158 84Z" fill="#F2B4B8" opacity=".0"/>
        <path d="M118 72 L124 96 L150 84Z M282 72 L276 96 L250 84Z" fill="#F2B4B8"/>
        <path d="M256 104 q10 -8 17 1 q-2 9 -11 6 q-5 -3 -2 -7" fill="none" stroke="#7FB04A" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
        <ellipse cx="138" cy="160" rx="17" ry="10.5" fill="#F2B4B8" opacity=".85"/><ellipse cx="262" cy="160" rx="17" ry="10.5" fill="#F2B4B8" opacity=".85"/>
        <g fill="none" stroke="#244A38" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round"><path d="M146 146 Q157 132 168 146"/><path d="M232 146 Q243 132 254 146"/><path d="M188 157 Q194 166 200 158 Q206 166 212 157"/></g>
        <path d="M196 169 Q200 175 204 169Z" fill="#F2B4B8" stroke="#244A38" strokeWidth="2" strokeLinejoin="round"/>
        <g stroke="#244A38" strokeWidth="3.6" strokeLinecap="round"><path d="M110 150 L84 145"/><path d="M110 160 L82 162"/><path d="M290 150 L316 145"/><path d="M290 160 L318 162"/></g>
      </g>
        <path d="M112 282 H288 V396 Q288 424 260 424 H140 Q112 424 112 396Z" fill="#DDF0E4" fillOpacity=".5"/>
      {COINS.slice(0, coins).map(([x, y]) => (
        <Coin key={`${x}-${y}`} x={x} y={y} />
      ))}
        <path d="M112 282 H288 V396 Q288 424 260 424 H140 Q112 424 112 396Z" fill="#DDF0E4" fillOpacity=".2" stroke="#244A38" strokeWidth="7" strokeLinejoin="round"/>
        <path d="M128 300 V380" stroke="#fff" strokeWidth="7" strokeLinecap="round" opacity=".7"/><path d="M128 392 Q130 404 142 408" stroke="#fff" strokeWidth="6" strokeLinecap="round" fill="none" opacity=".6"/>
        <rect x="102" y="252" width="196" height="30" rx="12" fill="#D4644A" stroke="#244A38" strokeWidth="7"/>
        <ellipse cx="200" cy="252" rx="98" ry="12" fill="#D4644A" stroke="#244A38" strokeWidth="7"/>
        <ellipse cx="258" cy="252" rx="24" ry="5" fill="#244A38"/>
        <path d="M122 264 H150" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity=".35"/>
        <g><circle cx="142" cy="246" r="16" fill="#244A38"/><circle cx="142" cy="246" r="12.5" fill="#FBF0D8"/><circle cx="142" cy="249" r="4.4" fill="#F2B4B8"/></g>
      {party && (
        <g className="mp-spark" fill="#F5BC3A" stroke="#244A38" strokeWidth="3" strokeLinejoin="round">
          <path d="M60 60 l5 12 12 5 -12 5 -5 12 -5 -12 -12 -5 12 -5z" />
          <path d="M340 40 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z" />
          <path d="M350 170 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
        </g>
      )}
    </svg>
  )
}
