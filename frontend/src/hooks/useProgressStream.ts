/* SSE progress stream with automatic polling fallback.
 *
 * Native EventSource cannot send custom Authorization headers, and Synorix
 * authenticates via Clerk Bearer JWT. So we read the SSE stream with
 * fetch + ReadableStream and parse the events manually. No extra dep.
 *
 * Robustness:
 *  - reconnects up to 5 times (exponential backoff 1s/2s/4s/8s/16s)
 *  - after 5 failures → falls back to plain 2s polling on
 *    /processing-status (the legacy endpoint is preserved for this).
 *  - cleans up on unmount and on projectId change.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@clerk/clerk-react'

export type ProgressPhase = 'pending' | 'in_progress' | 'complete' | 'error'

export interface ProgressState {
  step: string | null
  progress: number
  detail: string
  phase: ProgressPhase
  isConnected: boolean
  usingFallback: boolean
}

interface ProgressEventData {
  status?: string
  progress?: number
  current_step?: string
  detail?: string
  pipeline_type?: string
  message?: string
}

interface Options {
  enabled?: boolean
  onComplete?: (step: string) => void
  onError?: (step: string, message: string) => void
}

const MAX_FAILURES = 5
const BACKOFF_BASE_MS = 1000

/**
 * Map a tracker snapshot (or the legacy fallback shape) onto our React state.
 * Both endpoints (SSE + processing-status) return the same JSON shape, so
 * one mapper covers both paths.
 *
 * `step` (used by ProgressDisplay to highlight the active step in its list)
 * must be the step *id* (e.g. 'analyzing_pass1'), not the human label.
 * The backend's pipeline_tracker.get_status() exposes the active step id
 * via the `status` field when a step is in progress; otherwise that field
 * holds the pipeline state ('running'/'completed'/'error') which won't
 * match any step id and is fine — the list just shows nothing highlighted.
 *
 * `detail` keeps the human label so the line under the cercle reads
 * naturally ("Analyse des exigences administratives").
 */
const _PIPELINE_STATES = new Set([
  'idle', 'pending', 'running', 'completed', 'error',
])

function mapSnapshotToState(
  snap: ProgressEventData,
  prevConnected: boolean,
  prevFallback: boolean,
  eventType: string | null = null,
): ProgressState {
  const status = snap.status ?? 'idle'
  let phase: ProgressPhase = 'in_progress'
  if (eventType === 'complete' || status === 'completed') phase = 'complete'
  else if (eventType === 'error' || status === 'error') phase = 'error'
  else if (status === 'idle' || status === 'pending') phase = 'pending'

  const stepKey = _PIPELINE_STATES.has(status) ? null : status
  return {
    step: stepKey,
    progress: typeof snap.progress === 'number' ? snap.progress : 0,
    detail: snap.detail || snap.current_step || '',
    phase,
    isConnected: prevConnected,
    usingFallback: prevFallback,
  }
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  // Block already trimmed of trailing \n\n. Lines: "event: foo" / "data: bar"
  let event = 'message'
  const dataLines: string[] = []
  for (const raw of block.split('\n')) {
    const line = raw.replace(/\r$/, '')
    if (!line || line.startsWith(':')) continue // comment / heartbeat
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const field = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trimStart()
    if (field === 'event') event = value
    else if (field === 'data') dataLines.push(value)
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

export function useProgressStream(
  projectId: string | null | undefined,
  opts: Options = {},
): ProgressState {
  const { getToken } = useAuth()
  const enabled = opts.enabled !== false && !!projectId

  const [state, setState] = useState<ProgressState>({
    step: null,
    progress: 0,
    detail: '',
    phase: 'pending',
    isConnected: false,
    usingFallback: false,
  })

  // Refs for things we don't want to retrigger effects on.
  const onCompleteRef = useRef(opts.onComplete)
  const onErrorRef = useRef(opts.onError)
  onCompleteRef.current = opts.onComplete
  onErrorRef.current = opts.onError

  // Connection bookkeeping
  const abortRef = useRef<AbortController | null>(null)
  const fallbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const failureCountRef = useRef(0)
  const stoppedRef = useRef(false)

  const cleanupConnection = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (fallbackTimerRef.current) {
      clearInterval(fallbackTimerRef.current)
      fallbackTimerRef.current = null
    }
  }, [])

  // Polling fallback — used when SSE refuses to stay open after MAX_FAILURES.
  const startPolling = useCallback(
    (projectIdFinal: string) => {
      if (fallbackTimerRef.current) return
      setState((prev) => ({ ...prev, isConnected: true, usingFallback: true }))
      const tick = async () => {
        try {
          const token = await getToken()
          const resp = await fetch(`/api/projects/${projectIdFinal}/processing-status`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          })
          if (!resp.ok) return
          const snap: ProgressEventData = await resp.json()
          setState(() => mapSnapshotToState(snap, true, true))
          if (snap.status === 'completed') {
            onCompleteRef.current?.(snap.current_step ?? '')
            cleanupConnection()
          } else if (snap.status === 'error') {
            onErrorRef.current?.(snap.current_step ?? '', snap.message ?? '')
            cleanupConnection()
          }
        } catch {
          // Ignore single-poll failures; we'll retry next tick.
        }
      }
      // Run once immediately, then every 2s.
      tick()
      fallbackTimerRef.current = setInterval(tick, 2000)
    },
    [getToken, cleanupConnection],
  )

  // Open one SSE connection. Returns a promise that resolves when the
  // stream closes (either normally or with an error). The caller decides
  // whether to reconnect.
  const openSse = useCallback(
    async (projectIdFinal: string): Promise<'closed' | 'failed'> => {
      const token = await getToken()
      if (!token) return 'failed'

      const ctrl = new AbortController()
      abortRef.current = ctrl

      let resp: Response
      try {
        resp = await fetch(
          `/api/projects/${projectIdFinal}/progress-stream`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'text/event-stream',
            },
            signal: ctrl.signal,
            // Keep the request alive across visibility changes.
            cache: 'no-store',
          },
        )
      } catch (err) {
        if ((err as Error).name === 'AbortError') return 'closed'
        return 'failed'
      }

      if (!resp.ok || !resp.body) return 'failed'

      setState((p) => ({ ...p, isConnected: true, usingFallback: false }))
      failureCountRef.current = 0

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let closeReason: 'closed' | 'failed' = 'closed'

      try {
        // Stream loop
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let sepIdx: number
          while ((sepIdx = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, sepIdx)
            buffer = buffer.slice(sepIdx + 2)
            const parsed = parseSseBlock(block)
            if (!parsed) continue
            if (parsed.event === 'heartbeat') continue
            let data: ProgressEventData = {}
            try {
              data = JSON.parse(parsed.data)
            } catch {
              continue
            }
            // 'init' / 'progress' / 'complete' / 'error'
            const next = mapSnapshotToState(data, true, false, parsed.event)
            setState((prev) => ({ ...prev, ...next, isConnected: true, usingFallback: false }))
            if (parsed.event === 'complete') {
              onCompleteRef.current?.(data.current_step ?? '')
              stoppedRef.current = true
              cleanupConnection()
              return 'closed'
            }
            if (parsed.event === 'error') {
              onErrorRef.current?.(data.current_step ?? '', data.message ?? '')
              stoppedRef.current = true
              cleanupConnection()
              return 'closed'
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          closeReason = 'closed'
        } else {
          closeReason = 'failed'
        }
      } finally {
        setState((prev) => ({ ...prev, isConnected: false }))
      }
      return closeReason
    },
    [getToken, cleanupConnection],
  )

  // Main connect-with-retry loop.
  const startSse = useCallback(
    async (projectIdFinal: string) => {
      while (!stoppedRef.current) {
        const result = await openSse(projectIdFinal)
        if (stoppedRef.current) return
        if (result === 'closed') return // normal end
        // Failed → backoff
        failureCountRef.current += 1
        if (failureCountRef.current >= MAX_FAILURES) {
          startPolling(projectIdFinal)
          return
        }
        const delay = BACKOFF_BASE_MS * 2 ** (failureCountRef.current - 1)
        await new Promise<void>((resolve) => {
          reconnectTimerRef.current = setTimeout(resolve, delay)
        })
      }
    },
    [openSse, startPolling],
  )

  useEffect(() => {
    if (!enabled || !projectId) {
      cleanupConnection()
      stoppedRef.current = true
      return
    }
    stoppedRef.current = false
    failureCountRef.current = 0
    setState({
      step: null,
      progress: 0,
      detail: '',
      phase: 'pending',
      isConnected: false,
      usingFallback: false,
    })
    startSse(projectId)
    return () => {
      stoppedRef.current = true
      cleanupConnection()
    }
  }, [enabled, projectId, startSse, cleanupConnection])

  return state
}
