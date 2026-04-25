import { describe, it, expect } from 'vitest'
import { extractErrorMessage } from './errors'

describe('extractErrorMessage', () => {
  it('extracts Spring ProblemDetail detail field', () => {
    const err = { response: { data: { detail: 'CORS origin not allowed' } } }
    expect(extractErrorMessage(err)).toBe('CORS origin not allowed')
  })

  it('extracts message from JSON blob embedded in detail', () => {
    const err = {
      response: {
        data: {
          detail: 'Enable Banking auth failed: {"code":400,"message":"Redirect URI not allowed","error":"REDIRECT_URI_NOT_ALLOWED","detail":null}',
        },
      },
    }
    expect(extractErrorMessage(err)).toBe('Redirect URI not allowed')
  })

  it('extracts response data message field when detail absent', () => {
    const err = { response: { data: { message: 'Invalid credentials' } } }
    expect(extractErrorMessage(err)).toBe('Invalid credentials')
  })

  it('extracts message from JSON string in err.message', () => {
    const err = new Error('{"code":400,"message":"Bad redirect URI","error":"ERR"}')
    expect(extractErrorMessage(err)).toBe('Bad redirect URI')
  })

  it('uses err.message as fallback for plain text', () => {
    const err = new Error('Network error')
    expect(extractErrorMessage(err)).toBe('Network error')
  })

  it('skips Axios boilerplate and returns fallback', () => {
    const err = new Error('Request failed with status code 400')
    expect(extractErrorMessage(err, 'Custom fallback')).toBe('Custom fallback')
  })

  it('returns provided fallback for unknown error shape', () => {
    expect(extractErrorMessage({}, 'Fallback')).toBe('Fallback')
  })

  it('returns default fallback when no fallback provided', () => {
    expect(extractErrorMessage({})).toBe('Une erreur est survenue')
  })
})
