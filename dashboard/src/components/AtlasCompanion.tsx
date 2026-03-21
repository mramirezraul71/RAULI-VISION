/**
 * RAULI-VISION — Atlas Companion v3.0
 *
 * Personalización por usuario:
 *  - Identificación via URL ?u=TOKEN (con fallback a localStorage)
 *  - Nombre del usuario cargado desde Atlas API (puerto 8791)
 *  - Saludo personalizado, memoria persistente de preferencias
 *  - Contador de visitas, último mensaje recordado
 *  - Panel admin embebido para crear usuarios y generar enlaces
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { pingPresence, synthesizeSpeech, getVoiceEnabled, setVoiceEnabled } from '../api/client'

// ── Config ─────────────────────────────────────────────────────────────────
const ATLAS_API  = ''
const TOKEN_KEY  = 'rauli_user_token'
const AVATAR_POS_KEY = 'rauli_avatar_pos_v1'
const DRAG_MARGIN = 8
const AVATAR_DEFAULT_WIDTH = 96
const AVATAR_DEFAULT_HEIGHT = 132

// ── Tipos ──────────────────────────────────────────────────────────────────
type CompState = 'idle' | 'speaking' | 'thinking' | 'sleeping'
type AvatarPosition = { x: number; y: number }

interface UserProfile {
  token:       string
  name:        string
  visit_count: number
  memory: {
    searches:    string[]
    preferences: Record<string, unknown>
    topics:      string[]
    last_msg:    string
  }
}

// ── Helpers de tiempo ──────────────────────────────────────────────────────
const hora   = () => new Date().getHours()
const saludo = () => hora() < 12 ? 'Buenos días' : hora() < 19 ? 'Buenas tardes' : 'Buenas noches'

// ── Banco de frases ────────────────────────────────────────────────────────
const greetings = (name: string | null) => name ? [
  () => `¡${saludo()}, ${name}! Soy ATLAS, tu asistente`,
  () => `¡${saludo()}, ${name}! Sistema activo y en línea`,
  () => `¡Hola, ${name}! Qué bueno que volviste`,
  () => `¡${name}! Todo listo y en orden para ti`,
] : [
  () => `¡${saludo()}! Soy ATLAS, tu asistente en RAULI Visión`,
  () => `¡${saludo()}! Sistema RAULI activo y operando`,
  () => `¡${saludo()}! Todo funcionando correctamente`,
]

const wakeupMsgs = (name: string | null) => name ? [
  `¡Hola de nuevo, ${name}! Aquí estoy`,
  `¡${name}! Creía que me habías olvidado`,
  `¡Listo, ${name}! ¿En qué te ayudo?`,
  `¡Despierto y a tus órdenes, ${name}!`,
] : [
  '¡Uy! Creí que me habías olvidado',
  '¡Hola de nuevo! Aquí estoy',
  'Mmm... ya me despertaste, ¿en qué te ayudo?',
  '¡Presente! ¿Qué necesitas?',
]

const clickMsgs = (name: string | null) => [
  name ? `¡Aquí estoy, ${name}! ¿En qué te ayudo?` : '¡Estaba esperándote! ¿En qué te ayudo?',
  '¡Aquí estoy! A tus órdenes',
  'Di la palabra y busco lo que necesitas',
  'Listo para asistirte',
  '¿Qué video o música buscas hoy?',
  '¡Claro que sí! ¿Qué quieres ver?',
  'Siempre disponible para ti',
  '¿Quieres explorar tendencias de TikTok?',
]

const IDLE_MSGS = [
  'Explorando contenido nuevo para ti...',
  'Los videos de tendencias se actualizan cada 5 minutos',
  '¿Sabías que puedes buscar música cubana en la pestaña CAMI?',
  'Conexión estable con el espejo exterior',
  'Procesando contenido en tiempo real',
  'TikTok, videos y música: todo curado para Cuba',
  'Todo funcionando. Listos para navegar',
  '¿Necesitas algo? Solo tócame',
  'Plataforma activa. Sin límites.',
  'Buscando las mejores tendencias para ti',
]

const FUN_MSGS = [
  'Proceso más rápido que un café cubano caliente',
  '¿Sabías que navego internet sin restricciones? En serio.',
  'Mi hobby favorito: traer videos del exterior',
  'Llevo horas aquí y nunca me canso... porque soy IA',
  '¿Todo bien por ahí? Aquí yo, trayendo contenido',
  'Dicen que los robots no dormimos, pero yo hago mi mejor intento',
]

const NIGHT_MSGS = [
  'Buenas noches. El espejo sigue activo aunque tú descanses',
  'Turno nocturno operativo. Todo el contenido disponible',
  'La madrugada es tranquila, pero los videos no se detienen',
]

const MORNING_MSGS = [
  'Buen día. Nuevas tendencias cargadas y listas',
  '¡Buenos días! Plataforma en perfectas condiciones',
  'Mañana despejada. Contenido actualizado.',
]

const pick = (arr: (string | (() => string))[]) => {
  const v = arr[Math.floor(Math.random() * arr.length)]
  return typeof v === 'function' ? v() : v
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const clampAvatarPosition = (x: number, y: number, width = AVATAR_DEFAULT_WIDTH, height = AVATAR_DEFAULT_HEIGHT): AvatarPosition => {
  if (typeof window === 'undefined') return { x, y }
  const maxX = Math.max(DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN)
  const maxY = Math.max(DRAG_MARGIN, window.innerHeight - height - DRAG_MARGIN)
  return {
    x: clamp(x, DRAG_MARGIN, maxX),
    y: clamp(y, DRAG_MARGIN, maxY),
  }
}

const getDefaultAvatarPosition = (): AvatarPosition => {
  if (typeof window === 'undefined') return { x: DRAG_MARGIN, y: DRAG_MARGIN }
  return clampAvatarPosition(
    window.innerWidth - AVATAR_DEFAULT_WIDTH - 16,
    window.innerHeight - AVATAR_DEFAULT_HEIGHT - 80,
  )
}

const loadAvatarPosition = (): AvatarPosition | null => {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(AVATAR_POS_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return clampAvatarPosition(parsed.x, parsed.y)
    }
  } catch {
    // noop: valor inválido en localStorage
  }
  return null
}

// ── CSS ─────────────────────────────────────────────────────────────────────
const CSS = `
  .rv-scene { width:64px; height:80px; perspective:220px; perspective-origin:50% 15%; }
  .rv-body  {
    position:relative; width:64px; height:80px;
    transform-style:preserve-3d;
    animation: rv-float 3.5s ease-in-out infinite;
  }
  .rv-body[data-state="thinking"]  { animation: rv-float 3.5s ease-in-out infinite, rv-sway 2.2s ease-in-out infinite; }
  .rv-body[data-state="sleeping"]  { animation: rv-sleep-f 4.5s ease-in-out infinite; }
  .rv-body[data-state="speaking"]  { animation: rv-float 3.5s ease-in-out infinite, rv-talk-body 0.6s ease-in-out infinite; }

  .rv-head {
    position:absolute; top:0; left:8px;
    width:48px; height:40px;
    background: linear-gradient(145deg, #21262d, #161b22);
    border: 2px solid #39d3c4;
    border-radius: 11px 11px 8px 8px;
    box-shadow: 0 0 18px rgba(57,211,196,0.25);
    transform-style: preserve-3d;
    transform: translateZ(8px);
    transition: border-color 0.3s;
  }
  .rv-body[data-state="speaking"]  .rv-head { border-color:#7ee787; box-shadow:0 0 22px rgba(126,231,135,0.4); animation: rv-head-nod 0.5s ease-in-out infinite alternate; }
  .rv-body[data-state="thinking"]  .rv-head { border-color:#d29922; animation: rv-head-think 2.8s ease-in-out infinite; }
  .rv-body[data-state="sleeping"]  .rv-head { border-color:rgba(57,211,196,0.3); animation: rv-head-sleep 4s ease-in-out infinite; }

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
  .rv-body[data-state="sleeping"]  .rv-eye { height:2px; border-radius:2px; opacity:0.4; }
  .rv-body[data-state="speaking"]  .rv-eye { background:#7ee787; box-shadow:0 0 10px #7ee787; animation: rv-eye-speak 0.25s ease-in-out infinite alternate; }
  .rv-body[data-state="thinking"]  .rv-eye { animation: rv-eye-think 1.5s ease-in-out infinite alternate; }
  .rv-pupil { position:absolute; width:3px; height:3px; background:#0a0e14; border-radius:50%; top:2.5px; left:2.5px; transition: transform 0.08s ease; }

  .rv-mouth {
    position:absolute; bottom:4px; left:50%; transform:translateX(-50%);
    width:14px; height:2px; background:#39d3c4; border-radius:2px; opacity:0.6;
    transition: all 0.15s ease;
  }
  .rv-body[data-state="speaking"] .rv-mouth { background:#7ee787; animation: rv-mouth-talk 0.18s ease-in-out infinite alternate; }
  .rv-body[data-state="thinking"] .rv-mouth { width:6px; height:2px; border-radius:50%; opacity:0.3; }
  .rv-body[data-state="sleeping"] .rv-mouth { width:10px; opacity:0.25; }

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
  .rv-body[data-state="speaking"]  .rv-antenna-tip { background:#7ee787; box-shadow:0 0 14px #7ee787; animation: rv-antenna-speak 0.3s ease infinite; }
  .rv-body[data-state="thinking"]  .rv-antenna-tip { animation: rv-antenna-think 0.5s ease infinite; }

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
  .rv-body[data-state="speaking"] .rv-core { background:#7ee787; animation: rv-core-speak 0.2s ease infinite; opacity:0.9; }
  .rv-body[data-state="thinking"] .rv-core { animation: rv-core-think 0.8s ease infinite; }

  .rv-arm {
    position:absolute; top:42px;
    width:5px; height:18px;
    background:#21262d; border:1px solid rgba(57,211,196,0.2); border-radius:3px;
    transform-origin:top center; transform-style:preserve-3d;
  }
  .rv-arm.l { left:4px;  animation: rv-arm-l 3s ease-in-out infinite; }
  .rv-arm.r { right:4px; animation: rv-arm-r 3s ease-in-out infinite; }
  .rv-body[data-state="speaking"] .rv-arm.l { animation: rv-arm-talk-l 0.4s ease-in-out infinite alternate; }
  .rv-body[data-state="speaking"] .rv-arm.r { animation: rv-arm-talk-r 0.4s ease-in-out infinite alternate; }

  .rv-zzz { position:absolute; top:-8px; right:-8px; font-size:12px; opacity:0; pointer-events:none; color:#39d3c4; }
  .rv-body[data-state="sleeping"] .rv-zzz { animation: rv-zzz 2s ease-in-out infinite; }

  /* ── KEYFRAMES ── */
  @keyframes rv-float {
    0%  { transform:translateY(0)    rotateX(1deg)  rotateY(0deg); }
    35% { transform:translateY(-5px) rotateX(-1deg) rotateY(4deg); }
    70% { transform:translateY(-7px) rotateX(-2deg) rotateY(-4deg); }
    100%{ transform:translateY(0)    rotateX(1deg)  rotateY(0deg); }
  }
  @keyframes rv-talk-body {
    0%,100%{ transform:translateY(0); }
    50%    { transform:translateY(-2px); }
  }
  @keyframes rv-sway {
    0%,100%{ transform:translateY(0)   rotateZ(0deg); }
    25%    { transform:translateY(-4px) rotateZ(-4deg); }
    75%    { transform:translateY(-4px) rotateZ(4deg); }
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
    0%  { transform:translateZ(8px) rotateX(-12deg) rotateY(-5deg); }
    100%{ transform:translateZ(8px) rotateX(8deg)   rotateY(5deg); }
  }
  @keyframes rv-head-sleep {
    0%,100%{ transform:translateZ(8px) rotateX(-26deg) rotateZ(-5deg); }
    50%    { transform:translateZ(8px) rotateX(-20deg) rotateZ(5deg); }
  }
  @keyframes rv-eye-think { 0%{ transform:translateX(-2px); } 100%{ transform:translateX(2px); } }
  @keyframes rv-eye-speak { 0%{ height:8px; } 100%{ height:4px; } }
  @keyframes rv-mouth-talk {
    0%  { width:14px; height:2px; border-radius:2px; }
    50% { width:10px; height:6px; border-radius:4px; }
    100%{ width:12px; height:3px; border-radius:3px; }
  }
  @keyframes rv-antenna { 0%,100%{ opacity:1; box-shadow:0 0 8px #39d3c4; } 50%{ opacity:0.5; box-shadow:0 0 16px #39d3c4; } }
  @keyframes rv-antenna-speak { 0%,100%{ opacity:1; transform:scale(1); } 50%{ opacity:0.7; transform:scale(1.3); } }
  @keyframes rv-antenna-think { 0%,100%{ opacity:1; background:#39d3c4; } 50%{ opacity:0.3; background:#d29922; } }
  @keyframes rv-core { 0%,100%{ opacity:0.4; transform:translateX(-50%) scale(1); } 50%{ opacity:0.8; transform:translateX(-50%) scale(1.1); } }
  @keyframes rv-core-think { 0%,100%{ background:#39d3c4; opacity:0.6; } 50%{ background:#d29922; opacity:1; } }
  @keyframes rv-core-speak { 0%,100%{ opacity:0.6; transform:translateX(-50%) scale(0.8); } 50%{ opacity:1; transform:translateX(-50%) scale(1.4); } }
  @keyframes rv-arm-l { 0%,100%{ transform:rotate(3deg); } 50%{ transform:rotate(-2deg); } }
  @keyframes rv-arm-r { 0%,100%{ transform:rotate(-3deg); } 50%{ transform:rotate(2deg); } }
  @keyframes rv-arm-talk-l { 0%{ transform:rotate(-18deg); } 100%{ transform:rotate(5deg); } }
  @keyframes rv-arm-talk-r { 0%{ transform:rotate(5deg); } 100%{ transform:rotate(-18deg); } }
  @keyframes rv-zzz { 0%{ opacity:0; transform:translate(0,0) scale(0.7); } 50%{ opacity:0.7; transform:translate(6px,-12px) scale(1); } 100%{ opacity:0; transform:translate(12px,-24px) scale(0.5); } }
`

// ── API helpers ────────────────────────────────────────────────────────────
async function apiGetUser(token: string): Promise<UserProfile | null> {
  try {
    const r = await fetch(`${ATLAS_API}/api/rauli/users/${token}`)
    const j = await r.json()
    return j.ok ? (j.data as UserProfile) : null
  } catch { return null }
}

async function apiRecordVisit(token: string): Promise<void> {
  try { await fetch(`${ATLAS_API}/api/rauli/users/${token}/visit`, { method: 'PATCH' }) }
  catch { /* best-effort */ }
}

async function apiSaveMemory(token: string, patch: {
  preferences?: Record<string, unknown>
  last_msg?: string
  topics?: string[]
}): Promise<void> {
  try {
    await fetch(`${ATLAS_API}/api/rauli/users/${token}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  } catch { /* best-effort */ }
}

async function apiCreateUser(name: string): Promise<{ token: string; link: string } | null> {
  try {
    const r = await fetch(`${ATLAS_API}/api/rauli/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const j = await r.json()
    return j.ok ? j.data : null
  } catch { return null }
}

async function apiListUsers(): Promise<UserProfile[]> {
  try {
    const r = await fetch(`${ATLAS_API}/api/rauli/users`)
    const j = await r.json()
    return j.ok ? j.data : []
  } catch { return [] }
}

async function apiDeleteUser(token: string): Promise<boolean> {
  try {
    const r = await fetch(`${ATLAS_API}/api/rauli/users/${token}`, { method: 'DELETE' })
    const j = await r.json()
    return j.ok
  } catch { return false }
}

// ── Token resolution ───────────────────────────────────────────────────────
function resolveToken(): string | null {
  const param = new URLSearchParams(window.location.search).get('u')
  if (param) {
    localStorage.setItem(TOKEN_KEY, param)
    return param
  }
  return localStorage.getItem(TOKEN_KEY)
}

// ══════════════════════════════════════════════════════════════════════════════
// Admin Panel — crear usuarios y generar enlaces
// ══════════════════════════════════════════════════════════════════════════════
function AdminPanel({ onClose }: { onClose: () => void }) {
  const [users, setUsers]       = useState<UserProfile[]>([])
  const [newName, setNewName]   = useState('')
  const [lastLink, setLastLink] = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    apiListUsers().then(setUsers)
  }, [])

  const create = async () => {
    if (!newName.trim()) return
    setLoading(true)
    const result = await apiCreateUser(newName.trim())
    setLoading(false)
    if (result) {
      const fullLink = `${window.location.origin}${result.link}`
      setLastLink(fullLink)
      setNewName('')
      apiListUsers().then(setUsers)
    }
  }

  const remove = async (token: string) => {
    await apiDeleteUser(token)
    setUsers(u => u.filter(x => x.token !== token))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#0d1117] border border-[rgba(57,211,196,0.35)] rounded-2xl p-5 w-96 max-h-[80vh] overflow-y-auto"
        style={{ boxShadow: '0 0 40px rgba(57,211,196,0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#39d3c4] font-semibold text-sm tracking-wide">
            ATLAS — Gestión de usuarios
          </h2>
          <button onClick={onClose} className="text-[#484f58] hover:text-[#c9d1d9] text-lg leading-none">×</button>
        </div>

        {/* Crear usuario */}
        <div className="mb-4">
          <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-2">Nuevo usuario</p>
          <div className="flex gap-2">
            <input
              className="flex-1 bg-[#161b22] border border-[rgba(57,211,196,0.25)] rounded-lg px-3 py-1.5 text-[12px] text-[#c9d1d9] placeholder-[#484f58] outline-none focus:border-[#39d3c4]"
              placeholder="Nombre completo..."
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && create()}
            />
            <button
              onClick={create}
              disabled={loading || !newName.trim()}
              className="bg-[#39d3c4] text-[#0d1117] font-semibold text-[11px] px-3 py-1.5 rounded-lg disabled:opacity-40 hover:bg-[#4ee1d3] transition-colors"
            >
              {loading ? '...' : 'Crear'}
            </button>
          </div>
        </div>

        {/* Enlace generado */}
        {lastLink && (
          <div className="mb-4 p-3 bg-[#161b22] border border-[rgba(126,231,135,0.3)] rounded-xl">
            <p className="text-[10px] text-[#7ee787] uppercase tracking-widest mb-1">Enlace generado</p>
            <p className="text-[11px] text-[#c9d1d9] break-all font-mono">{lastLink}</p>
            <button
              onClick={() => navigator.clipboard.writeText(lastLink)}
              className="mt-2 text-[10px] text-[#39d3c4] hover:text-[#4ee1d3] underline"
            >
              Copiar enlace
            </button>
          </div>
        )}

        {/* Lista de usuarios */}
        <div>
          <p className="text-[10px] text-[#484f58] uppercase tracking-widest mb-2">
            Usuarios registrados ({users.length})
          </p>
          {users.length === 0 && (
            <p className="text-[11px] text-[#484f58] italic">Sin usuarios aún</p>
          )}
          <div className="space-y-2">
            {users.map(u => (
              <div
                key={u.token}
                className="flex items-center justify-between p-2.5 bg-[#161b22] border border-[rgba(57,211,196,0.15)] rounded-lg"
              >
                <div>
                  <p className="text-[12px] text-[#c9d1d9] font-medium">{u.name}</p>
                  <p className="text-[10px] text-[#484f58]">
                    {u.visit_count} visita{u.visit_count !== 1 ? 's' : ''}
                    {' · '}
                    <span className="font-mono">{u.token}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigator.clipboard.writeText(`${window.location.origin}/?u=${u.token}`)}
                    className="text-[10px] text-[#39d3c4] hover:text-[#4ee1d3]"
                    title="Copiar enlace"
                  >
                    🔗
                  </button>
                  <button
                    onClick={() => remove(u.token)}
                    className="text-[10px] text-[#f85149] hover:text-red-400"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
export function AtlasCompanion() {
  const [state, setState]         = useState<CompState>('idle')
  const [bubble, setBubble]       = useState('')
  const [bubbleOn, setBubbleOn]   = useState(false)
  const [soundOn, setSoundOn]     = useState(() => getVoiceEnabled())
  const [headRX, setHeadRX]       = useState(0)
  const [headRY, setHeadRY]       = useState(0)
  const [clickCount, setClickCount] = useState(0)
  const [user, setUser]           = useState<UserProfile | null>(null)
  const [showAdmin, setShowAdmin] = useState(false)
  const [position, setPosition]   = useState<AvatarPosition>(() => loadAvatarPosition() ?? getDefaultAvatarPosition())

  const containerRef  = useRef<HTMLDivElement>(null)
  const bubbleTimer   = useRef<ReturnType<typeof setTimeout>>()
  const autoTimer     = useRef<ReturnType<typeof setTimeout>>()
  const voicesRef     = useRef<SpeechSynthesisVoice[]>([])
  const stateRef      = useRef<CompState>('idle')
  const soundRef      = useRef(getVoiceEnabled())
  const blinkTimer    = useRef<ReturnType<typeof setInterval>>()
  const uttRef        = useRef<SpeechSynthesisUtterance | null>(null)
  const audioRef      = useRef<HTMLAudioElement | null>(null)
  const tokenRef      = useRef<string | null>(null)
  const nameRef       = useRef<string | null>(null)
  const dragActiveRef = useRef(false)
  const dragMovedRef  = useRef(false)
  const dragStartRef  = useRef<AvatarPosition | null>(null)
  const pointerRef    = useRef<AvatarPosition | null>(null)
  const skipClickRef  = useRef(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { soundRef.current = soundOn }, [soundOn])
  useEffect(() => {
    localStorage.setItem(AVATAR_POS_KEY, JSON.stringify(position))
  }, [position])

  // ── Inject CSS ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('rv-css-v3')) {
      const s = document.createElement('style')
      s.id = 'rv-css-v3'
      s.textContent = CSS
      document.head.appendChild(s)
    }
    const loadVoices = () => {
      const v = window.speechSynthesis?.getVoices() ?? []
      if (v.length) voicesRef.current = v
    }
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    const retry = setTimeout(loadVoices, 500)
    return () => {
      window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
      clearTimeout(retry)
    }
  }, [])

  // ── Cargar perfil de usuario al montar ────────────────────────────────────
  useEffect(() => {
    const token = resolveToken()
    if (!token) return
    tokenRef.current = token
    apiGetUser(token).then(profile => {
      if (!profile) return
      setUser(profile)
      nameRef.current = profile.name
      // Restaurar preferencia de sonido (localStorage tiene prioridad)
      const prefs = profile.memory?.preferences ?? {}
      if (typeof prefs.sound === 'boolean') {
        const cur = getVoiceEnabled()
        // Solo aplicar si no hay preferencia explícita en localStorage
        if (localStorage.getItem('rauli_voice_enabled') === null) {
          setSoundOn(prefs.sound)
          soundRef.current = prefs.sound
          setVoiceEnabled(prefs.sound)
        } else {
          setSoundOn(cur)
          soundRef.current = cur
        }
      }
      // Registrar visita
      apiRecordVisit(token)
    })
  }, [])

  // ── Heartbeat de presencia (cada 30s) ────────────────────────────────────
  useEffect(() => {
    const token = resolveToken()
    if (!token) return
    pingPresence(token) // ping inmediato al montar
    const interval = setInterval(() => pingPresence(token), 30_000)
    return () => clearInterval(interval)
  }, [])

  // ── Fallback: Browser TTS ─────────────────────────────────────────────────
  const speakBrowser = useCallback((text: string, onDone?: () => void) => {
    if (!window.speechSynthesis) { onDone?.(); return }
    speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang   = 'es-ES'
    utter.rate   = 0.95
    utter.pitch  = 1.1
    utter.volume = 0.9
    const es = voicesRef.current.find(v => v.lang?.startsWith('es'))
           ?? voicesRef.current.find(v => v.lang?.startsWith('en'))
           ?? voicesRef.current[0]
           ?? null
    if (es) utter.voice = es
    utter.onstart = () => setState('speaking')
    utter.onend   = () => { setState('idle'); onDone?.() }
    utter.onerror = () => { setState('idle'); onDone?.() }
    uttRef.current = utter
    speechSynthesis.speak(utter)
  }, [])

  // ── TTS principal: Gemini TTS → fallback browser ──────────────────────────
  const speak = useCallback((text: string, onDone?: () => void) => {
    if (!soundRef.current) { onDone?.(); return }
    // Detener cualquier audio previo
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    speechSynthesis?.cancel()
    setState('speaking')
    synthesizeSpeech(text).then(blob => {
      if (!soundRef.current) { setState('idle'); onDone?.(); return }
      if (!blob) {
        // Fallback a browser TTS si Gemini falla
        speakBrowser(text, onDone)
        return
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => {
        setState('idle')
        URL.revokeObjectURL(url)
        audioRef.current = null
        onDone?.()
      }
      audio.onerror = () => {
        setState('idle')
        URL.revokeObjectURL(url)
        audioRef.current = null
        speakBrowser(text, onDone) // fallback
      }
      audio.play().catch(() => {
        setState('idle')
        speakBrowser(text, onDone) // fallback si autoplay bloqueado
      })
    }).catch(() => speakBrowser(text, onDone))
  }, [speakBrowser])

  // ── Mostrar burbuja + TTS opcional ────────────────────────────────────────
  const say = useCallback((text: string, ms = 4000, doSpeak = false) => {
    clearTimeout(bubbleTimer.current)
    setBubble(text)
    setBubbleOn(true)
    const duration = doSpeak ? Math.max(ms, text.length * 75 + 1000) : ms
    bubbleTimer.current = setTimeout(() => setBubbleOn(false), duration)
    if (doSpeak) speak(text)
    // Guardar último mensaje en memoria del usuario
    if (tokenRef.current && doSpeak) {
      apiSaveMemory(tokenRef.current, { last_msg: text })
    }
  }, [speak])

  // ── Saludo inicial — solo burbuja de texto (no TTS: autoplay sin gesto bloqueado)
  useEffect(() => {
    const t = setTimeout(() => {
      say(pick(greetings(nameRef.current)), 5000, false)
    }, 2200)
    return () => clearTimeout(t)
  }, [say])

  // ── Auto-talk loop ────────────────────────────────────────────────────────
  const scheduleAuto = useCallback(() => {
    clearTimeout(autoTimer.current)
    const delay = 28000 + Math.random() * 30000
    autoTimer.current = setTimeout(() => {
      if (stateRef.current !== 'idle') { scheduleAuto(); return }
      const h = hora()
      const pool = h >= 22 || h < 6
        ? NIGHT_MSGS
        : h < 9
          ? MORNING_MSGS
          : Math.random() < 0.3 ? FUN_MSGS : IDLE_MSGS
      say(pick(pool), 4500, false) // sin TTS automático — autoplay bloqueado sin gesto
      scheduleAuto()
    }, delay)
  }, [say])

  useEffect(() => {
    scheduleAuto()
    return () => clearTimeout(autoTimer.current)
  }, [scheduleAuto])

  // ── Auto-blink ────────────────────────────────────────────────────────────
  useEffect(() => {
    blinkTimer.current = setInterval(() => {
      if (stateRef.current === 'sleeping') return
      const eyes = containerRef.current?.querySelectorAll('.rv-eye')
      if (!eyes) return
      eyes.forEach(e => e.classList.add('blink'))
      setTimeout(() => eyes.forEach(e => e.classList.remove('blink')), 110)
    }, 2500 + Math.random() * 2500)
    return () => clearInterval(blinkTimer.current)
  }, [])

  // ── 3D mouse tracking ─────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (stateRef.current !== 'idle') return
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width  / 2
      const cy = rect.top  + rect.height / 2
      const mx = Math.max(-1, Math.min(1, (e.clientX - cx) / 320))
      const my = Math.max(-1, Math.min(1, (e.clientY - cy) / 320))
      const pl = el.querySelector<HTMLElement>('#rv-pupil-l')
      const pr = el.querySelector<HTMLElement>('#rv-pupil-r')
      if (pl && pr) {
        pl.style.transform = `translate(${mx * 2}px, ${my * 1.5}px)`
        pr.style.transform = `translate(${mx * 2}px, ${my * 1.5}px)`
      }
      setHeadRX(my * 14)
      setHeadRY(mx * 21)
    }
    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  // ── Click handler ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onResize = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      const width = rect?.width ?? AVATAR_DEFAULT_WIDTH
      const height = rect?.height ?? AVATAR_DEFAULT_HEIGHT
      setPosition(prev => clampAvatarPosition(prev.x, prev.y, width, height))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const endDrag = useCallback(() => {
    if (!dragActiveRef.current) return
    dragActiveRef.current = false
    if (dragMovedRef.current) skipClickRef.current = true
    dragStartRef.current = null
    pointerRef.current = null
  }, [])

  const handleDragMove = useCallback((e: PointerEvent) => {
    if (!dragActiveRef.current || !dragStartRef.current || !pointerRef.current) return
    const dx = e.clientX - pointerRef.current.x
    const dy = e.clientY - pointerRef.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMovedRef.current = true
    const rect = containerRef.current?.getBoundingClientRect()
    const width = rect?.width ?? AVATAR_DEFAULT_WIDTH
    const height = rect?.height ?? AVATAR_DEFAULT_HEIGHT
    setPosition(clampAvatarPosition(dragStartRef.current.x + dx, dragStartRef.current.y + dy, width, height))
  }, [])

  useEffect(() => {
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', handleDragMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [endDrag, handleDragMove])

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    dragActiveRef.current = true
    dragMovedRef.current = false
    pointerRef.current = { x: e.clientX, y: e.clientY }
    dragStartRef.current = position
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  const handleClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false
      return
    }
    if (state === 'sleeping') {
      setState('idle')
      say(pick(wakeupMsgs(nameRef.current)), 3500, true)
      return
    }
    if (state === 'speaking') {
      speechSynthesis?.cancel()
      setState('idle')
      return
    }
    const next = clickCount + 1
    setClickCount(next)
    const pool = next % 4 === 0 ? FUN_MSGS : next % 3 === 0 ? IDLE_MSGS : clickMsgs(nameRef.current)
    say(pick(pool), 4000, true)
  }

  const handleDblClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (skipClickRef.current) {
      skipClickRef.current = false
      return
    }
    if (state === 'sleeping') {
      setState('idle')
      say('Mmm... ¡ya desperté!', 3000, true)
    } else {
      speechSynthesis?.cancel()
      setState('sleeping')
      setBubbleOn(false)
      say('Voy a descansar un momento... z z z', 3000, false)
    }
  }

  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = !soundOn
    setSoundOn(next)
    soundRef.current = next
    setVoiceEnabled(next) // sincronizar con ChatPage y localStorage global
    if (!next) {
      speechSynthesis?.cancel()
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      setState('idle')
    }
    say(next ? '¡Voz activada! Ahora me escuchas.' : 'Voz silenciada. Seguiré escribiendo.', 3000, next)
    if (tokenRef.current) {
      apiSaveMemory(tokenRef.current, { preferences: { sound: next } })
    }
  }

  // ── Head transform ────────────────────────────────────────────────────────
  const ANIM: Set<CompState> = new Set(['thinking', 'speaking', 'sleeping'])
  const headStyle: React.CSSProperties = ANIM.has(state)
    ? {}
    : { transform: `translateZ(8px) rotateY(${headRY}deg) rotateX(${headRX}deg)`, transition: 'transform 0.08s ease' }

  return (
    <>
      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      <div
        ref={containerRef}
        className="fixed z-30 select-none cursor-grab active:cursor-grabbing touch-none"
        style={{
          left: position.x,
          top: position.y,
          filter: 'drop-shadow(0 0 14px rgba(57,211,196,0.18))',
          touchAction: 'none',
        }}
        onPointerDown={handlePointerDown}
      >
        {/* ── Burbuja de diálogo ── */}
        {bubbleOn && bubble && (
          <div
            className="absolute right-0 bg-[#0d1117] border border-[rgba(57,211,196,0.45)] rounded-xl rounded-br-none px-3 py-2 text-[11px] leading-relaxed text-[#c9d1d9] shadow-xl pointer-events-none"
            style={{
              bottom: 96, whiteSpace: 'normal', maxWidth: 190, minWidth: 110,
              animation: 'rv-bubble-in 0.22s ease',
              boxShadow: state === 'speaking'
                ? '0 0 16px rgba(126,231,135,0.25), 0 4px 12px rgba(0,0,0,0.5)'
                : '0 4px 16px rgba(0,0,0,0.5)',
              borderColor: state === 'speaking' ? 'rgba(126,231,135,0.5)' : undefined,
            }}
          >
            {state === 'speaking' && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#7ee787] mr-1 mb-0.5"
                style={{ animation: 'rv-dot 0.6s ease infinite', verticalAlign: 'middle' }} />
            )}
            {bubble}
            <span
              className="absolute right-3 bg-[#0d1117] border-r border-b"
              style={{
                bottom: -5, width: 10, height: 10,
                transform: 'rotate(45deg)', display: 'block',
                borderColor: state === 'speaking' ? 'rgba(126,231,135,0.5)' : 'rgba(57,211,196,0.45)',
              }}
            />
          </div>
        )}

        {/* ── Badge de usuario ── */}
        {user && (
          <div
            className="absolute right-0 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{
              bottom: 82,
              background: 'rgba(13,17,23,0.9)',
              border: '1px solid rgba(57,211,196,0.3)',
              fontSize: 10,
              color: '#39d3c4',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ opacity: 0.6 }}>●</span>
            <span className="font-medium">{user.name}</span>
          </div>
        )}

        {/* ── Botón silencio ── */}
        <button
          onClick={toggleSound}
          onPointerDown={e => e.stopPropagation()}
          className="absolute -bottom-1 -left-2 z-10 w-5 h-5 rounded-full bg-[#21262d] border border-[rgba(57,211,196,0.3)] text-[#484f58] hover:text-[#39d3c4] hover:border-[#39d3c4] flex items-center justify-center transition-all cursor-pointer"
          title={soundOn ? 'Silenciar' : 'Activar voz'}
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

        {/* ── Botón admin (visible solo si no hay usuario) ── */}
        {!user && (
          <button
            onClick={e => { e.stopPropagation(); setShowAdmin(true) }}
            onPointerDown={e => e.stopPropagation()}
            className="absolute -bottom-1 right-0 z-10 w-5 h-5 rounded-full bg-[#21262d] border border-[rgba(57,211,196,0.3)] text-[#484f58] hover:text-[#39d3c4] hover:border-[#39d3c4] flex items-center justify-center transition-all text-[9px] cursor-pointer"
            title="Gestión de usuarios"
          >
            ⚙
          </button>
        )}

        {/* ── Robot ── */}
        <div
          className="rv-scene"
          onClick={handleClick}
          onDoubleClick={handleDblClick}
          title={state === 'sleeping' ? 'ATLAS duerme — toca para despertar' : 'ATLAS — toca para hablar · doble toque para dormir'}
        >
          <div className="rv-body" data-state={state}>
            <div className="rv-antenna"><div className="rv-antenna-tip" /></div>
            <div className="rv-head" style={headStyle}>
              <div className="rv-visor">
                <div className="rv-eye"><div className="rv-pupil" id="rv-pupil-l" /></div>
                <div className="rv-eye"><div className="rv-pupil" id="rv-pupil-r" /></div>
              </div>
              <div className="rv-mouth" />
            </div>
            <div className="rv-arm l" />
            <div className="rv-arm r" />
            <div className="rv-torso"><div className="rv-core" /></div>
            <div className="rv-zzz">z</div>
          </div>
        </div>

        <style>{`
          @keyframes rv-bubble-in {
            from { opacity:0; transform:translateY(8px) scale(0.88); }
            to   { opacity:1; transform:translateY(0)   scale(1); }
          }
          @keyframes rv-dot {
            0%,100%{ opacity:1; transform:scale(1); }
            50%    { opacity:0.3; transform:scale(0.6); }
          }
        `}</style>
      </div>
    </>
  )
}
