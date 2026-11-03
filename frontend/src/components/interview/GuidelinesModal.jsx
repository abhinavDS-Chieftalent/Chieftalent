import { useEffect, useRef, useState } from 'react'
import { VideoCamera, Microphone, CheckCircle, Warning } from '@phosphor-icons/react'
import { api } from '@/api.js'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { setStream, getStream } from './mediaStore'
import { triggerFullscreen } from '@/vendor/react-proctoring'

const GUIDELINES = [
  'Stay in a quiet environment. External voices and background conversations may be detected and flagged.',
  'Maintain a good and stable internet connection.',
  'Use a clear, plain background behind you.',
  'Make sure nobody else is present in the room.',
  'Wear a plain formal shirt.',
  'Do not switch browser tabs during the interview. Tab switching triggers a warning, and after 3 warnings the interview stops automatically.',
  'The interview runs in full screen. Leaving full screen counts as a violation.',
  'Developer tools and their keyboard shortcuts are disabled during the interview.',
  'The entire interview session is recorded. Behave professionally.',
  'The interview has a maximum duration of 30 minutes and will automatically end when the limit is reached.',
]

export default function GuidelinesModal({ token, onDone }) {
  const [read, setRead] = useState(false)
  const [truthful, setTruthful] = useState(false)
  const [busy, setBusy] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')

  // Camera/mic pre-check state
  const [mediaState, setMediaState] = useState('idle') // idle | testing | ready | failed
  const [mediaError, setMediaError] = useState('')
  const [micLevel, setMicLevel] = useState(0)
  const videoRef = useRef(null)
  const audioCtxRef = useRef(null)
  const rafRef = useRef(0)

  const testMedia = async () => {
    setMediaState('testing')
    setMediaError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { width: 1280, height: 720 },
      })
      setStream(stream) // share with the interview runner - no re-prompt later
      // NOTE: the <video> element only mounts once mediaState flips to
      // 'ready' (below) - attaching srcObject here would hit a null ref.
      // The effect below attaches the stream after the element exists.
      setMediaState('ready')

      // Live mic level meter so the candidate can verify their microphone.
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)()
        audioCtxRef.current = ctx
        const src = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        src.connect(analyser)
        const buf = new Uint8Array(analyser.frequencyBinCount)
        const tick = () => {
          analyser.getByteFrequencyData(buf)
          const avg = buf.reduce((a, b) => a + b, 0) / buf.length
          setMicLevel(Math.min(100, Math.round((avg / 128) * 100)))
          rafRef.current = requestAnimationFrame(tick)
        }
        tick()
      } catch { /* meter is best-effort */ }
    } catch (e) {
      setMediaState('failed')
      setMediaError(
        e.name === 'NotAllowedError'
          ? 'Permission denied. Click the camera icon in your browser address bar, allow camera and microphone, then try again.'
          : `Could not access camera/microphone: ${e.message}`
      )
    }
  }

  // Attach the preview stream once the <video> element has mounted
  // (mediaState === 'ready' renders it) - this is what fixes the black
  // preview: srcObject must be set AFTER the element exists.
  useEffect(() => {
    if (mediaState !== 'ready') return
    const stream = getStream()
    const el = videoRef.current
    if (el && stream) {
      el.srcObject = stream
      el.play().catch(() => {})
    }
  }, [mediaState])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close().catch(() => {})
    }
  }, [])

  const proceed = async () => {
    if (busy || !(read && truthful && mediaState === 'ready')) return
    setBusy(true)
    setError('')
    setPreparing(false)
    try {
      // Enter fullscreen NOW, inside the click gesture (browsers require it).
      triggerFullscreen()
      // The AI question set is generated ahead of time (kicked off at email
      // verification), so this is normally instant. If it is still preparing,
      // the server answers 202 {preparing:true}; retry a bounded number of
      // times (each call itself waits server-side). We never fall back to
      // generic pre-coded questions - the candidate always gets the AI set.
      let res = await api.acceptGuidelines(token)
      let tries = 0
      while (res && res.preparing) {
        setPreparing(true)
        if (++tries > 5) {
          throw new Error(
            'Your questions are taking longer than expected to prepare. Please click the button again to retry.'
          )
        }
        res = await api.acceptGuidelines(token)
      }
      onDone()
    } catch (err) {
      setError(
        /timed? ?out|timeout/i.test(err.message || '')
          ? 'This is taking longer than usual. Your questions may still be preparing. Refresh the page and try again.'
          : err.message
      )
      setBusy(false)
      setPreparing(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <Card>
        <CardContent className="pt-6">
          <h1 className="font-display text-2xl font-extrabold">
            You are proceeding to the online interview
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The information you provided must be truthful. Please read and follow the
            interview guidelines before continuing.
          </p>

          <ul className="mt-5 space-y-2.5">
            {GUIDELINES.map((g) => (
              <li key={g} className="flex items-start gap-2.5 text-sm leading-relaxed">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{g}</span>
              </li>
            ))}
          </ul>

          {/* Camera & microphone pre-check */}
          <div className="mt-6 rounded-lg border p-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <VideoCamera size={16} /> Camera & microphone check
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Required before you start. Make sure you can see yourself and the mic bar
              moves when you speak. Permissions will not be asked again during the interview.
            </p>

            {mediaState !== 'ready' && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={testMedia}
                disabled={mediaState === 'testing'}
              >
                <VideoCamera size={14} />
                {mediaState === 'testing'
                  ? 'Waiting for permission…'
                  : mediaState === 'failed'
                    ? 'Try again'
                    : 'Enable camera & microphone'}
              </Button>
            )}

            {mediaState === 'failed' && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-fail">
                <Warning size={14} className="mt-0.5 shrink-0" /> {mediaError}
              </p>
            )}

            {mediaState === 'ready' && (
              <div className="mt-3 space-y-3">
                <div className="w-full max-w-sm overflow-hidden rounded-lg border bg-ink">
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    style={{ transform: 'scaleX(-1)' }}
                    className="aspect-video w-full"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Microphone size={16} className="shrink-0 text-muted-foreground" />
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-100"
                      style={{ width: `${Math.max(4, micLevel)}%` }}
                    />
                  </div>
                </div>
                <p className="flex items-center gap-1.5 text-xs text-pass">
                  <CheckCircle size={14} /> Camera and microphone are working. You are
                  ready to start.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 space-y-3 border-t pt-5">
            <div className="flex items-start gap-2.5">
              <input
                id="chk-read"
                type="checkbox"
                checked={read}
                onChange={(e) => setRead(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#EE5A2E]"
              />
              <Label htmlFor="chk-read" className="text-sm font-normal cursor-pointer">
                I have read and understood the interview guidelines.
              </Label>
            </div>
            <div className="flex items-start gap-2.5">
              <input
                id="chk-truth"
                type="checkbox"
                checked={truthful}
                onChange={(e) => setTruthful(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#EE5A2E]"
              />
              <Label htmlFor="chk-truth" className="text-sm font-normal cursor-pointer">
                The information I provided is accurate and truthful.
              </Label>
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-fail">{error}</p>}

          <Button
            className="mt-5 w-full"
            disabled={!(read && truthful && mediaState === 'ready') || busy}
            onClick={proceed}
          >
            {busy ? 'Starting…' : 'Confirm & start interview in full screen'}
          </Button>
          {busy && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              {preparing
                ? 'Preparing your personal question set. This can take a moment - please keep this page open.'
                : 'Starting your interview…'}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
