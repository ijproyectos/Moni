import { useId } from 'react'

const HEAD =
  'M120 150 C80 150 46 140 46 108 C46 88 52 74 60 66 C58 54 58 42 64 38 C70 36 88 50 96 56 C110 52 130 52 144 56 C152 50 170 36 176 38 C182 42 182 54 180 66 C188 74 194 88 194 108 C194 140 160 150 120 150 Z'
const BODY =
  'M74 140 C66 160 64 192 72 206 C76 212 84 214 92 214 L148 214 C156 214 164 212 168 206 C176 192 174 160 166 140 Z'

/**
 * Moni's lucky cat with its whole body, the same drawing as `assets/mascot/personaje_carga-por-voz.svg` (path for path),
 * inline so its parts can move: the raised paw (in front of the body, pad towards the person, like a lucky cat's), the eyes, the mouth and the sound lines. It only moves while `mode` says
 * it is listening or thinking (see `.fortune-cat` in styles/index.css); at rest it is exactly the mascot.
 */
export function MoniFortuneCat({
  mode,
  pulse = 0,
  className,
}: {
  mode?: 'listening' | 'thinking'
  /** Changes every time a word is heard: restarts the mouth. */
  pulse?: number
  className?: string
}) {
  const id = useId()
  const headClip = `${id}-head`
  const bodyClip = `${id}-body`
  return (
    <svg
      viewBox="0 0 240 240"
      aria-hidden="true"
      focusable="false"
      data-mode={mode}
      className={`fortune-cat overflow-visible ${className ?? ''}`}
    >
      <defs>
        <clipPath id={headClip}>
          <path d={HEAD} />
        </clipPath>
        <clipPath id={bodyClip}>
          <path d={BODY} />
        </clipPath>
      </defs>
      <g transform="translate(-4 0)" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="124" cy="221" rx="62" ry="6" fill="#064735" opacity="0.12" />
        <path d={BODY} fill="#FFF2D8" />
        <g clipPath={`url(#${bodyClip})`}>
          <path d="M150 150 C172 168 172 200 154 218 L190 218 L190 140 Z" fill="#F3DFBA" />
          <path d="M60 138 Q120 162 180 138 L180 148 Q120 174 60 148 Z" fill="#B8EC7C" />
          <path d="M60 145 Q120 170 180 145 L180 148 Q120 174 60 148 Z" fill="#9FD962" />
          <path d="M60 148 Q120 174 180 148" fill="none" stroke="#064735" strokeWidth="4.5" />
        </g>
        <path d={BODY} fill="none" stroke="#064735" strokeWidth="5" />
        <path d="M104 213 V205 M136 213 V205" fill="none" stroke="#064735" strokeWidth="4.5" />
        <circle cx="120" cy="166" r="7.5" fill="#FFC83D" stroke="#064735" strokeWidth="4" />
        <path d="M115.5 164.5 H124.5" fill="none" stroke="#064735" strokeWidth="2.5" />
        <path
          d="M120 174 L126.5 180.5 L120 187 L113.5 180.5 Z"
          fill="#E5533D"
          stroke="#064735"
          strokeWidth="3"
        />
        <path d="M120 177.5 L123 180.5 L120 183.5 L117 180.5 Z" fill="#FFC83D" />
        <path
          d="M120 187 V189 M116.5 189 H123.5 L125 198 H115 Z"
          fill="#E5533D"
          stroke="#064735"
          strokeWidth="2.5"
        />
        <path d="M98 178 L107 202" fill="none" stroke="#064735" strokeWidth="11" />
        <circle cx="95" cy="168" r="12" fill="#064735" />
        <path d="M88 163 Q91 158 97 157" fill="none" stroke="#4E7A6B" strokeWidth="3" />
        <path d="M85 170 H105 M87 175 H103" fill="none" stroke="#2E6352" strokeWidth="2" />
        <ellipse
          cx="108"
          cy="200"
          rx="12"
          ry="10"
          fill="#FFF2D8"
          stroke="#064735"
          strokeWidth="4.5"
        />
        <path d="M104 191.5 V195 M110 191.5 V195" fill="none" stroke="#064735" strokeWidth="3" />

        <g className="fc-head">
          <path d={HEAD} fill="#FFF2D8" />
          <path
            d="M132 30 C160 26 204 40 204 84 L196 90 A11 11 0 0 1 176 84 A11 11 0 0 1 158 72 A11 11 0 0 1 146 56 L134 30 Z"
            fill="#B8EC7C"
            clipPath={`url(#${headClip})`}
          />
          <path
            d="M170 72 C163 72 161 63 167 61 C172 59 175 65 171 67"
            fill="none"
            stroke="#8CCB4E"
            strokeWidth="3"
          />
          <path d={HEAD} fill="none" stroke="#064735" strokeWidth="5" />
          <path d="M68 59 L69 47 L84 55 Z" fill="#F5B8B0" stroke="#F5B8B0" strokeWidth="4" />
          <path d="M172 59 L171 47 L156 55 Z" fill="#F5B8B0" stroke="#F5B8B0" strokeWidth="4" />
          <ellipse cx="76" cy="125" rx="10" ry="6" fill="#F5B8B0" />
          <ellipse cx="164" cy="125" rx="10" ry="6" fill="#F5B8B0" />
          <path
            className="fc-eyes"
            d="M86 107 Q94 99 102 107 M138 107 Q146 99 154 107"
            fill="none"
            stroke="#064735"
            strokeWidth="5"
          />
          <path
            d="M115.5 116 H124.5 L120 120.5 Z"
            fill="#064735"
            stroke="#064735"
            strokeWidth="3"
          />
          <path
            d="M120 120.5 V122.5 M108.5 122 Q114.25 128 120 122.5 Q125.75 128 131.5 122"
            fill="none"
            stroke="#064735"
            strokeWidth="4"
          />
          <path
            key={pulse}
            className="fc-mouth"
            d="M114.5 126 Q120 136 125.5 126 Z"
            fill="#064735"
            stroke="#064735"
            strokeWidth="2.5"
          />
          <ellipse cx="120" cy="130.5" rx="3" ry="2" fill="#F5B8B0" />
          <path
            d="M54 115 L66 117.5 M54 125 L66 125 M186 115 L174 117.5 M186 125 L174 125"
            fill="none"
            stroke="#064735"
            strokeWidth="3.5"
          />
        </g>
        <path
          className="fc-sound"
          d="M40 90 L30 83 M38 104 L26 104 M40 118 L30 125"
          fill="none"
          stroke="#F0AA2A"
          strokeWidth="4"
        />
        <g className="fc-arm">
          <g className="fc-forearm">
            <path d="M139.6 182.7 L157.7 137.7 L174.4 144.3 L156.4 189.3 Z" fill="#FFF2D8" />
            <path
              d="M139.6 182.7 L157.7 137.7 M174.4 144.3 L156.4 189.3"
              fill="none"
              stroke="#064735"
              strokeWidth="5"
            />
          </g>
          <g className="fc-hand">
            <circle cx="166" cy="130" r="17" fill="#FFF2D8" stroke="#064735" strokeWidth="5" />
            <ellipse cx="166" cy="135" rx="6.5" ry="5.2" fill="#F5B8B0" />
            <circle cx="159" cy="125.5" r="2.5" fill="#F5B8B0" />
            <circle cx="166" cy="122" r="2.5" fill="#F5B8B0" />
            <circle cx="173" cy="125.5" r="2.5" fill="#F5B8B0" />
          </g>
        </g>
      </g>
    </svg>
  )
}
