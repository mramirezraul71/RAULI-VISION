/**
 * RAULI-VISION — Atlas Companion Mini
 * Robot 3D CSS conversacional. Voz nativa (Web Speech API, sin API key).
 * Posición: bottom-20 right-4 (encima de la bottom nav, lado derecho).
 */
import { useCallback, useEffect, useRef, useState } from 'react'

type CompState = 'idle' | 'speaking' | 'thinking' | 'sleeping'

const GREETINGS = [
  'Hola, soy ATLAS',
  'Sistema RAULI activo',
  'A tus ordenes',
  'Todo funciona correctamente',
  'Listo para ayudar',
]

const CSS = `
  /* ── RAULI Companion scene ── */
  .rv-scene { width:64px; height:80px; perspective:220px; perspective-origin:50% 15%; }
  .rv-body  {
    position:relative; width:64px; height:80px;
    transform-style:preserve-3d;
    animation: rv-float 3.5s ease-in-out infinite;
  }
  .rv-body[data-state="thinking"]    { animation: rv-float 3.5s ease-in-out infinite, rv-sway 2.2s ease-in-out infinite; }
  .rv-body[data-state="celebrating"] { animation: rv-spin  0.8s ease-in-out infinite; }
  .rv-body[data-state="sleeping"]    { animation: rv-sleep-f 4.5s ease-in-out infinite; }

  .rv-head {
    position:absolute; top:0; left:8px;
    width:48px; height:40px;
    background: linear-gradient(145deg, #21262d, #161b22);
    border: 2px solid #39d3c4;
    border-radius: 11px 11px 8px 8px;
    box-shadow: 0 0 16px rgba(57,211,196,0.2);
    transform-style: preserve-3d;
    transform: translateZ(8px);
    transition: border-color 0.3s;
  }
  .rv-body[data-state="thinking"]    .rv-head { animation: rv-head-think 2.8s ease-in-out infinite; }
  .rv-body[data-state="speaking"]    .rv-head { animation: rv-head-nod   0.5s ease-in-out infinite alternate; }
  .rv-body[data-state="sleeping"]    .rv-head { animation: rv-head-sleep 4s   ease-in-out infinite; }

  .rv-visor {
    position:absolute; top:6px; left:5px; right:5px; height:20px;
    background:rgba(0,0,0,0.5); border-radius:6px;
    display:flex; align-items:center; justify-content:center; gap:10px; overflow:hidden;
  }
  .rv-eye {
    width:8px; height:8px; border-radius:50%;
    background:#39d3c4; box-shadow: 0 0 8px #39d3c4;
    position:relative; transition: height 0.1s;
  }
  .rv-eye.blink { height:2px !important; border-radius:2px !important; }
  .rv-body[data-state="sleeping"]  .rv-eye  { height:2px; border-radius:2px; opacity:0.4; }
  .rv-body[data-state="speaking"]  .rv-eye  { animation: rv-eye-speak 0.3s ease-in-out infinite alternate; }
  .rv-body[data-state="thinking"]  .rv-eye  { animation: rv-eye-think 1.5s ease-in-out infinite alternate; }
  .rv-pupil { position:absolute; width:3px; height:3px; background:#0a0e14; border-radius:50%; top:2.5px; left:2.5px; transition: transform 0.08s ease; }

  .rv-mouth {
    position:absolute; bottom:4px; left:50%; transform:translateX(-50%);
    width:14px; height:2px; background:#39d3c4; border-radius:2px; opacity:0.6;
    transition: all 0.2s ease;
  }
  .rv-body[data-state="speaking"] .rv-mouth { animation: rv-mouth 0.2s ease-in-out infinite alternate; }
  .rv-body[data-state="thinking"] .rv-mouth { width:8px; opacity:0.3; }

  .rv-antenna {
    position:absolute; top:-10px; left:50%;
    transform:translateX(-50%) translateZ(10px);
    width:2px; height:10px; background:#39d3c4;
  }
  .rv-antenna-tip {
    position:absolute; top:-3px; left:-3px;
    width:8px; height:8px; border-radius:50%;
    background:#39d3c4; box-shadow:0 0 8px #39d3c4;
    animation: rv-antenna 2s ease-in-out infinite;
  }
  .rv-body[data-state="thinking"] .rv-antenna-tip { animation: rv-antenna-think 0.5s ease infinite; }

  .rv-torso {
    position:absolute; top:38px; left:12px;
    width:40px; height:26px;
    background:linear-gradient(180deg,#21262d,#161b22);
    border:1.5px solid rgba(57,211,196,0.3); border-top:none;
    border-radius:4px 4px 10px 10px;
    box-shadow:0 4px 12px rgba(0,0,0,0.3);
    transform:translateZ(-4px);
  }
  .rv-core {
    position:absolute; top:5px; left:50%; transform:translateX(-50%);
    width:10px; height:10px; border-radius:50%;
    background:#39d3c4; opacity:0.6;
    animation: rv-core 2s ease-in-out infinite;
  }
  .rv-body[data-state="thinking"] .rv-core { animation: rv-core-think 0.8s ease infinite; }
  .rv-body[data-state="speaking"] .rv-core { animation: rv-core-speak 0.3s ease infinite; }

  .rv-arm {
    position:absolute; top:42px;
    width:5px; height:18px;
    background:#21262d; border:1px solid rgba(57,211,196,0.2); border-radius:3px;
    transform-origin:top center; transform-style:preserve-3d;
  }
  .rv-arm.l { left:4px;  animation: rv-arm-l 3s ease-in-out infinite; }
  .rv-arm.r { right:4px; animation: rv-arm-r 3s ease-in-out infinite; }

  .rv-zzz { position:absolute; top:-8px; right:-8px; font-size:12px; opacity:0; pointer-events:none; }
  .rv-body[data-state="sleeping"] .rv-zzz { animation: rv-zzz 2s ease-in-out infinite; }

  /* ── KEYFRAMES ── */
  @keyframes rv-float {
    0%  { transform:translateY(0)    rotateX(1deg)  rotateY(0deg); }
    35% { transform:translateY(-5px) rotateX(-1deg) rotateY(4deg); }
    70% { transform:translateY(-7px) rotateX(-2deg) rotateY(-4deg); }
    100%{ transform:translateY(0)    rotateX(1deg)  rotateY(0deg); }
  }
  @keyframes rv-sway {
    0%,100%{ transform:translateY(0)   rotateZ(0deg); }
    25%    { transform:translateY(-4px) rotateZ(-4deg); }
    75%    { transform:translateY(-4px) rotateZ(4deg); }
  }
  @keyframes rv-spin {
    0%  { transform:translateY(0)    rotateY(0deg)   scale(1); }
    50% { transform:translateY(-12px) rotateY(180deg) scale(1.06); }
    100%{ transform:translateY(0)    rotateY(360deg) scale(1); }
  }
  @keyframes rv-sleep-f {
    0%,100%{ transform:translateY(0)   rotateZ(-4deg); }
    50%    { transform:translateY(-3px) rotateZ(4deg); }
  }
  @keyframes rv-head-think {
    0%  { transform:translateZ(8px) rotateY(-18deg) rotateX(6deg); }
    33% { transform:translateZ(8px) rotateY(14deg)  rotateX(-4deg); }
    66% { transform:translateZ(8px) rotateY(22deg)  rotateX(9deg); }
    100%{ transform:translateZ(8px) rotateY(-18deg) rotateX(6deg); }
  }
  @keyframes rv-head-nod {
    0%  { transform:translateZ(8px) rotateX(-10deg) rotateY(-4deg); }
    100%{ transform:translateZ(8px) rotateX(6deg)   rotateY(4deg); }
  }
  @keyframes rv-head-sleep {
    0%,100%{ transform:translateZ(8px) rotateX(-26deg) rotateZ(-5deg); }
    50%    { transform:translateZ(8px) rotateX(-20deg) rotateZ(5deg); }
  }
  @keyframes rv-eye-think { 0%{ transform:translateX(-2px); } 100%{ transform:translateX(2px); } }
  @keyframes rv-eye-speak { 0%{ height:8px; } 100%{ height:5px; } }
  @keyframes rv-mouth { 0%{ width:14px; height:2px; } 100%{ width:10px; height:5px; border-radius:3px; } }
  @keyframes rv-antenna { 0%,100%{ opacity:1; box-shadow:0 0 8px #39d3c4; } 50%{ opacity:0.5; box-shadow:0 0 16px #39d3c4; } }
  @keyframes rv-antenna-think { 0%,100%{ opacity:1; background:#39d3c4; } 50%{ opacity:0.3; background:#d29922; } }
  @keyframes rv-core { 0%,100%{ opacity:0.4; transform:translateX(-50%) scale(1); } 50%{ opacity:0.8; transform:translateX(-50%) scale(1.1); } }
  @keyframes rv-core-think { 0%,100%{ background:#39d3c4; opacity:0.6; } 50%{ background:#d29922; opacity:1; } }
  @keyframes rv-core-speak { 0%,100%{ opacity:0.5; transform:translateX(-50%) scale(0.9); } 50%{ opacity:1; transform:translateX(-50%) scale(1.2); } }
  @keyframes rv-arm-l { 0%,100%{ transform:translateZ(3px) rotate(3deg);  } 50%{ transform:translateZ(3px) rotate(-2deg); } }
  @keyframes rv-arm-r { 0%,100%{ transform:translateZ(3px) rotate(-3deg); } 50%{ transform:translateZ(3px) rotate(2deg);  } }
  @keyframes rv-zzz { 0%{ opacity:0; transform:translate(0,0) scale(0.7); } 50%{ opacity:0.6; transform:translate(6px,-12px) scale(1); } 100%{ opacity:0; transform:translate(12px,-24px) scale(0.5); } }
`

export function AtlasCompanion() {
  const [state, setState] = useState<CompState>('idle')
  const [bubble, setBubble] = useState('')
  const [bubbleVisible, setBubbleVisible] = useState(false)
  const [headRX, setHeadRX] = useState(0)
  const [headRY, setHeadRY] = useState(0)
  const [soundOn, setSoundOn] = useState(true)

  const containerRef = useRef<HTMLDivElement>(null)
  const bubbleTimer  = useRef<ReturnType<typeof setTimeout>>()
  const voicesRef    = useRef<SpeechSynthesisVoice[]>([])
  const stateRef     = useRef<CompState>('idle')
  const blinkTimer   = useRef<ReturnType<typeof setInterval>>()
  const soundRef     = useRef(true)

  // Keep refs in sync
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { soundRef.current = soundOn }, [soundOn])

  // Inject CSS + load TTS voices
  useEffect(() => {
    if (!document.getElementById('atlas-rv-css')) {
      const s = document.createElement('style')
      s.id = 'atlas-rv-css'
      s.textContent = CSS
      document.head.appendChild(s)
    }
    if (window.speechSynthesis) {
      voicesRef.current = speechSynthesis.getVoices()
      speechSynthesis.addEventListener('voiceschanged', () => {
        voicesRef.current = speechSynthesis.getVoices()
      })
    }
  }, [])

  // TTS
  const speak = useCallback((text: string) => {
    if (!soundRef.current || !window.speechSynthesis) return
    speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang   = 'es-ES'
    utter.rate   = 1.05
    utter.pitch  = 1.1
    utter.volume = 0.85
    const esVoice = voicesRef.current.find(v => v.lang?.startsWith('es')) || null
    if (esVoice) utter.voice = esVoice
    utter.onstart = () => setState('speaking')
    utter.onend   = () => setState('idle')
    speechSynthesis.speak(utter)
  }, [])

  // Show bubble
  const say = useCallback((text: string, duration = 3500, doSpeak = false) => {
    clearTimeout(bubbleTimer.current)
    setBubble(text)
    setBubbleVisible(true)
    bubbleTimer.current = setTimeout(() => setBubbleVisible(false), duration)
    if (doSpeak) speak(text)
  }, [speak])

  // Greeting on mount
  useEffect(() => {
    const t = setTimeout(() => say(GREETINGS[0], 4000, true), 1800)
    return () => clearTimeout(t)
  }, [say])

  // Auto-blink
  useEffect(() => {
    blinkTimer.current = setInterval(() => {
      if (stateRef.current === 'sleeping') return
      const eyes = containerRef.current?.querySelectorAll('.rv-eye')
      if (!eyes) return
      eyes.forEach(e => e.classList.add('blink'))
      setTimeout(() => eyes.forEach(e => e.classList.remove('blink')), 100)
    }, 3000 + Math.random() * 2000)
    return () => clearInterval(blinkTimer.current)
  }, [])

  // 3D mouse tracking
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const s = stateRef.current
      if (s === 'speaking' || s === 'thinking' || s === 'sleeping') return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width  / 2
      const cy = rect.top  + rect.height / 2
      const mx = Math.max(-1, Math.min(1, (e.clientX - cx) / 300))
      const my = Math.max(-1, Math.min(1, (e.clientY - cy) / 300))

      // Pupil offset
      const pl = el.querySelector<HTMLElement>('#rv-pupil-l')
      const pr = el.querySelector<HTMLElement>('#rv-pupil-r')
      if (pl && pr) {
        pl.style.transform = `translate(${mx * 2}px, ${my * 1.5}px)`
        pr.style.transform = `translate(${mx * 2}px, ${my * 1.5}px)`
      }

      setHeadRX(my * 15)
      setHeadRY(mx * 22)
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  const handleClick = () => {
    if (state === 'sleeping') {
      setState('idle')
      say(GREETINGS[0], 3000, true)
      return
    }
    const msg = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    say(msg, 3000, true)
  }

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !soundOn
    setSoundOn(next)
    if (!next) speechSynthesis?.cancel()
    say(next ? 'Voz activada' : 'Voz silenciada', 2000, next)
  }

  // Compute head transform: JS-driven when idle, cleared for CSS animations
  const ANIM_STATES = new Set<CompState>(['thinking', 'speaking', 'sleeping'])
  const headStyle: React.CSSProperties = ANIM_STATES.has(state)
    ? {}  // CSS animation takes control
    : { transform: `translateZ(8px) rotateY(${headRY}deg) rotateX(${headRX}deg)`, transition: 'transform 0.08s ease' }

  return (
    <div
      ref={containerRef}
      className="fixed bottom-20 right-4 z-30 select-none"
      style={{ filter: 'drop-shadow(0 0 12px rgba(57,211,196,0.15))' }}
    >
      {/* Speech bubble */}
      {bubbleVisible && bubble && (
        <div
          className="absolute right-0 bg-[#161b22] border border-[rgba(57,211,196,0.4)] rounded-xl rounded-br-none px-3 py-2 text-[10px] leading-snug text-[#e6edf3] max-w-[150px] shadow-lg pointer-events-none"
          style={{ bottom: 88, whiteSpace: 'normal', animation: 'rv-bubble-in 0.25s ease' }}
        >
          {bubble}
          {/* Tail */}
          <span
            className="absolute right-3 bg-[#161b22] border-r border-b border-[rgba(57,211,196,0.4)]"
            style={{ bottom: -5, width: 10, height: 10, transform: 'rotate(45deg)', display: 'block' }}
          />
        </div>
      )}

      {/* Sound toggle */}
      <button
        onClick={toggleSound}
        className="absolute -bottom-2 -left-2 z-10 w-5 h-5 rounded-full bg-[#21262d] border border-[rgba(57,211,196,0.3)] text-[#484f58] hover:text-[#39d3c4] hover:border-[#39d3c4] flex items-center justify-center transition-all"
        title={soundOn ? 'Silenciar voz' : 'Activar voz'}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          {soundOn ? (
            <>
              <path d="M15.54 8.46a5 5 0 010 7.07"/>
              <path d="M19.07 4.93a10 10 0 010 14.14"/>
            </>
          ) : (
            <line x1="23" y1="9" x2="17" y2="15"/>
          )}
        </svg>
      </button>

      {/* Robot */}
      <div
        className="rv-scene cursor-pointer"
        onClick={handleClick}
        title="ATLAS — click para saludar"
      >
        <div className="rv-body" data-state={state}>
          {/* Antenna */}
          <div className="rv-antenna">
            <div className="rv-antenna-tip" />
          </div>

          {/* Head */}
          <div className="rv-head" style={headStyle}>
            <div className="rv-visor">
              <div className="rv-eye"><div className="rv-pupil" id="rv-pupil-l" /></div>
              <div className="rv-eye"><div className="rv-pupil" id="rv-pupil-r" /></div>
            </div>
            <div className="rv-mouth" />
          </div>

          {/* Arms */}
          <div className="rv-arm l" />
          <div className="rv-arm r" />

          {/* Torso */}
          <div className="rv-torso">
            <div className="rv-core" />
          </div>

          {/* Zzz */}
          <div className="rv-zzz">z</div>
        </div>
      </div>

      <style>{`
        @keyframes rv-bubble-in {
          from { opacity:0; transform:translateY(6px) scale(0.9); }
          to   { opacity:1; transform:translateY(0)   scale(1); }
        }
      `}</style>
    </div>
  )
}
