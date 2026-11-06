import type { Segment } from '../domain/phrases'

/** Renders a phrase from `domain/phrases`: the names in bold, the rest as plain text. */
export function PhraseText({ segments }: { segments: readonly Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.strong ? (
          <strong key={index} className="font-extrabold">
            {segment.text}
          </strong>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  )
}
