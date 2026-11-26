import { describe, expect, it } from 'vitest'
import {
  ALLOWED_AUDIO_MEDIA_TYPES,
  contentLengthTooLarge,
  LIMITS,
  MAX_BODY_BYTES,
  parseAudioRequest,
  validateTranscription,
} from './lib.ts'

const b64 = (byteLength: number) => btoa('a'.repeat(byteLength))

describe('parseAudioRequest', () => {
  it('accepts a well-formed clip for each allowed media type', () => {
    for (const mediaType of ALLOWED_AUDIO_MEDIA_TYPES) {
      expect(parseAudioRequest({ audio: b64(1_000), mediaType })).toEqual({
        ok: true,
        audio: b64(1_000),
        mediaType,
      })
    }
  })

  it('rejects a request that is not an object, or missing fields', () => {
    expect(parseAudioRequest(null)).toEqual({ ok: false, error: 'invalid_request' })
    expect(parseAudioRequest('audio/webm')).toEqual({ ok: false, error: 'invalid_request' })
    expect(parseAudioRequest([])).toEqual({ ok: false, error: 'invalid_request' })
    expect(parseAudioRequest({})).toEqual({ ok: false, error: 'invalid_audio' })
  })

  it('rejects an unsupported media type', () => {
    expect(parseAudioRequest({ audio: b64(100), mediaType: 'audio/flac' })).toEqual({
      ok: false,
      error: 'invalid_audio',
    })
  })

  it('rejects an empty or non-string audio field', () => {
    expect(parseAudioRequest({ audio: '', mediaType: 'audio/webm' })).toEqual({
      ok: false,
      error: 'invalid_audio',
    })
    expect(parseAudioRequest({ audio: 123, mediaType: 'audio/webm' })).toEqual({
      ok: false,
      error: 'invalid_audio',
    })
  })

  it('rejects malformed base64 (wrong padding or disallowed characters)', () => {
    expect(parseAudioRequest({ audio: 'abc', mediaType: 'audio/webm' })).toEqual({
      ok: false,
      error: 'invalid_audio',
    })
    expect(parseAudioRequest({ audio: 'ab!!', mediaType: 'audio/webm' })).toEqual({
      ok: false,
      error: 'invalid_audio',
    })
  })

  it('rejects a clip over the decoded size limit', () => {
    const tooBig = b64(LIMITS.maxAudioBytes + 1_000)
    expect(parseAudioRequest({ audio: tooBig, mediaType: 'audio/webm' })).toEqual({
      ok: false,
      error: 'audio_too_large',
    })
  })

  it('rejects a body whose encoded length alone already proves it is over the cap', () => {
    const tooBig = 'A'.repeat(MAX_BODY_BYTES + 4)
    expect(parseAudioRequest({ audio: tooBig, mediaType: 'audio/webm' })).toEqual({
      ok: false,
      error: 'audio_too_large',
    })
  })
})

describe('contentLengthTooLarge', () => {
  it('is false for a missing or unparsable header', () => {
    expect(contentLengthTooLarge(null)).toBe(false)
    expect(contentLengthTooLarge('not-a-number')).toBe(false)
  })

  it('is true only once the header value is over the cap', () => {
    expect(contentLengthTooLarge(String(MAX_BODY_BYTES))).toBe(false)
    expect(contentLengthTooLarge(String(MAX_BODY_BYTES + 1))).toBe(true)
  })
})

describe('validateTranscription', () => {
  it('accepts a plain transcript, trimmed', () => {
    expect(validateTranscription('  gasté 8000 en el super  ')).toEqual({
      ok: true,
      text: 'gasté 8000 en el super',
    })
  })

  it('rejects null (the model call failed) and an empty/whitespace-only result (nothing heard)', () => {
    expect(validateTranscription(null)).toEqual({ ok: false, error: 'audio_unreadable' })
    expect(validateTranscription('')).toEqual({ ok: false, error: 'audio_unreadable' })
    expect(validateTranscription('   ')).toEqual({ ok: false, error: 'audio_unreadable' })
  })

  it('caps a runaway transcript instead of trusting it whole', () => {
    const long = 'a'.repeat(LIMITS.maxTranscriptChars + 500)
    const result = validateTranscription(long)
    expect(result.ok).toBe(true)
    expect(result.ok && result.text).toHaveLength(LIMITS.maxTranscriptChars)
  })
})
