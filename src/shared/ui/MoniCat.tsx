import { useId } from 'react'

/**
 * Moni's cat (the same head as `assets/mascot/expresion_feliz.svg`, path for path), inline so its parts can move: a raised
 * paw and a coin that only exist while the menu is open, and the eyes that blink. Everything is driven by `data-phase`
 * ("open" | "close") from the CSS in styles/index.css; at rest it is exactly the mascot.
 */
export function MoniCat({ phase, className }: { phase?: 'open' | 'close'; className?: string }) {
  const clip = useId()
  const head =
    'M120 150 C80 150 46 140 46 108 C46 88 52 74 60 66 C58 54 58 42 64 38 C70 36 88 50 96 56 C110 52 130 52 144 56 C152 50 170 36 176 38 C182 42 182 54 180 66 C188 74 194 88 194 108 C194 140 160 150 120 150 Z'
  return (
    <svg
      viewBox="0 0 240 160"
      aria-hidden="true"
      focusable="false"
      data-phase={phase}
      className={`moni-cat overflow-visible ${className ?? ''}`}
    >
      <defs>
        <clipPath id={clip}>
          <path d={head} />
        </clipPath>
      </defs>
      <g strokeLinecap="round" strokeLinejoin="round">
        <g className="moni-coin" opacity="0">
          <circle cx="206" cy="16" r="9" fill="#FFC83D" stroke="#064735" strokeWidth="3.5" />
          <circle cx="206" cy="16" r="4.5" fill="none" stroke="#E0A200" strokeWidth="2.5" />
        </g>
        <g className="moni-paw" opacity="0">
          <path d="M184 98 C196 96 200 82 200 60" fill="none" stroke="#064735" strokeWidth="21" />
          <path d="M184 98 C196 96 200 82 200 60" fill="none" stroke="#FFF2D8" strokeWidth="11" />
          <circle cx="202" cy="46" r="13" fill="#FFF2D8" stroke="#064735" strokeWidth="5" />
          <ellipse cx="202" cy="49" rx="5.5" ry="4.5" fill="#F5B8B0" />
          <circle cx="195.5" cy="41" r="2.4" fill="#F5B8B0" />
          <circle cx="202" cy="38.5" r="2.4" fill="#F5B8B0" />
          <circle cx="208.5" cy="41" r="2.4" fill="#F5B8B0" />
        </g>
        <g className="moni-head">
          <path d={head} fill="#FFF2D8" />
          <path
            d="M132 30 C160 26 204 40 204 84 L196 90 A11 11 0 0 1 176 84 A11 11 0 0 1 158 72 A11 11 0 0 1 146 56 L134 30 Z"
            fill="#B8EC7C"
            clipPath={`url(#${clip})`}
          />
          <path
            d="M170 72 C163 72 161 63 167 61 C172 59 175 65 171 67"
            fill="none"
            stroke="#8CCB4E"
            strokeWidth="3"
          />
          <path d={head} fill="none" stroke="#064735" strokeWidth="5" />
          <path
            d="M68 59 L69 47 L84 55 Z M172 59 L171 47 L156 55 Z"
            fill="#F5B8B0"
            stroke="#F5B8B0"
            strokeWidth="4"
          />
          <ellipse cx="76" cy="125" rx="10" ry="6" fill="#F5B8B0" />
          <ellipse cx="164" cy="125" rx="10" ry="6" fill="#F5B8B0" />
          <path
            d="M115.5 116 H124.5 L120 120.5 Z"
            fill="#064735"
            stroke="#064735"
            strokeWidth="3"
          />
          <path
            className="moni-eyes"
            d="M86 108 Q94 99 102 108 M138 108 Q146 99 154 108"
            fill="none"
            stroke="#064735"
            strokeWidth="5"
          />
          <path
            d="M120 120.5 V122.5 M108.5 122 Q114.25 128 120 122.5 Q125.75 128 131.5 122"
            fill="none"
            stroke="#064735"
            strokeWidth="4"
          />
          <path
            d="M115.5 126 Q120 134 124.5 126 Z"
            fill="#064735"
            stroke="#064735"
            strokeWidth="2.5"
          />
          <ellipse cx="120" cy="129.6" rx="2.5" ry="1.7" fill="#F5B8B0" />
          <path
            d="M54 115 L66 117.5 M54 125 L66 125 M186 115 L174 117.5 M186 125 L174 125"
            fill="none"
            stroke="#064735"
            strokeWidth="3.5"
          />
        </g>
      </g>
    </svg>
  )
}
