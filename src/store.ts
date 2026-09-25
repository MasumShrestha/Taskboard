import { useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'
import type { Board, Card, Sprint, State } from './types'

const KEY = 'taskboard:v1'
export const uid = () => Math.random().toString(36).slice(2, 10)

/* ---------- dates (all ISO yyyy-mm-dd, local time) ---------- */
export const today = () => new Date().toLocaleDateString('en-CA')
export const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA')
}
export const diffDays = (a: string, b: string) =>
  Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000)

/* ---------- board helpers ---------- */
export const boardKey = (b: Board) =>
  b.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'TB'
export const cardKey = (b: Board, c: Card) => `${boardKey(b)}-${c.num ?? '—'}`
export const isDone = (b: Board, c: Card) => b.columns.length > 0 && c.columnId === b.columns[b.columns.length - 1].id
export const activeSprint = (b: Board) => b.sprints.find((s) => s.status === 'active')
export const weight = (c: Card) => c.points || 1
export const progressOf = (c: Card) => {
  const flags = [...(c.subtasks ?? []).map((s) => s.done), ...(c.checklists ?? []).flatMap((l) => l.items.map((i) => i.done))]
  const done = flags.filter(Boolean).length
  return { done, total: flags.length, pct: flags.length ? Math.round((done / flags.length) * 100) : 0 }
}
export const plain = (md: string) => md.replace(/\*\*|`/g, '').replace(/(^|\s)_(.+?)_/g, '$1$2').replace(/^\s*[-*] /gm, '')

export function newSprint(name: string, status: Sprint['status'] = 'planned'): Sprint {
  const start = today()
  return { id: uid(), name, start, end: addDays(start, 13), status }
}

export function newBoard(name: string): Board {
  return {
    id: uid(), name, members: [], fields: [], labels: [],
    sprints: [newSprint('Sprint 1', 'active')], nextNum: 1,
    columns: ['To Do', 'In Progress', 'Done'].map((n) => ({ id: uid(), name: n })),
    cards: [],
  }
}

// Upgrades data saved by older versions (no sprints, issue numbers, etc.).
function normalize(s: State): State {
  const boards = s.boards.map((b) => {
    let sprints = b.sprints
    let cards = b.cards
    if (!sprints?.length) {
      const sp = newSprint('Sprint 1', 'active')
      sprints = [sp]
      cards = cards.map((c) => ({ ...c, sprintId: sp.id }))
    }
    let n = b.nextNum ?? 1
    cards = cards.map((c) => ({ ...c, num: c.num ?? n++, created: c.created ?? today() }))
    return { ...b, sprints, cards, nextNum: n, labels: b.labels ?? [] }
  })
  return { boards, activeId: boards.some((b) => b.id === s.activeId) ? s.activeId : boards[0].id }
}

function loadLocal(): State | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))
  } catch { /* ignore */ }
  return null
}

export type Loaded = { state: State; saved: Record<string, string> }
const ACTIVE = 'taskboard:active'

// Loads the user's boards from Supabase. First login on a browser with old local boards imports them.
export async function loadRemote(userId: string): Promise<Loaded> {
  const { data, error } = await supabase.from('boards').select('id, data, updated_at').eq('owner', userId).order('updated_at')
  if (error) throw error
  const saved: Record<string, string> = {}
  let boards = (data ?? []).map((r) => { const b = r.data as Board; saved[b.id] = JSON.stringify(b); return b })
  if (!boards.length) {
    boards = (loadLocal() ?? { boards: [newBoard('My first board')] }).boards // unsaved -> uploaded by first sync
  }
  let activeId = boards[0].id
  try { const a = localStorage.getItem(ACTIVE); if (a && boards.some((b) => b.id === a)) activeId = a } catch { /* ignore */ }
  return { state: normalize({ boards, activeId }), saved }
}

// Keeps doneAt in sync with the last column so burndown/velocity have history.
function stampDone(b: Board): Board {
  const last = b.columns[b.columns.length - 1]
  const t = today()
  let changed = false
  const cards = b.cards.map((c) => {
    const done = !!last && c.columnId === last.id
    if (done && !c.doneAt) { changed = true; return { ...c, doneAt: t } }
    if (!done && c.doneAt) { changed = true; return { ...c, doneAt: undefined } }
    return c
  })
  return changed ? { ...b, cards } : b
}

export type SyncStatus = 'saved' | 'saving' | 'error'

export function useStore(initial: Loaded, userId: string) {
  const [state, setState] = useState<State>(initial.state)
  const [sync, setSync] = useState<SyncStatus>('saved')
  const saved = useRef<Record<string, string>>(initial.saved) // board id -> JSON last written to the database
  const stateRef = useRef(state)
  stateRef.current = state

  const flush = async () => {
    const s = stateRef.current
    const json = Object.fromEntries(s.boards.map((b) => [b.id, JSON.stringify(b)]))
    const changed = s.boards.filter((b) => saved.current[b.id] !== json[b.id])
    const removed = Object.keys(saved.current).filter((id) => !json[id])
    if (!changed.length && !removed.length) return setSync('saved')
    setSync('saving')
    try {
      if (changed.length) {
        const { error } = await supabase.from('boards').upsert(
          changed.map((b) => ({ id: b.id, owner: userId, name: b.name, data: b, updated_at: new Date().toISOString() })))
        if (error) throw error
        changed.forEach((b) => { saved.current[b.id] = json[b.id] })
      }
      if (removed.length) {
        const { error } = await supabase.from('boards').delete().in('id', removed)
        if (error) throw error
        removed.forEach((id) => delete saved.current[id])
      }
      setSync('saved')
    } catch { setSync('error') }
  }

  // debounce writes; also flush when the tab is hidden so quick edits are not lost
  useEffect(() => {
    const t = setTimeout(flush, 700)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])
  useEffect(() => {
    const h = () => document.visibilityState === 'hidden' && flush()
    document.addEventListener('visibilitychange', h)
    return () => document.removeEventListener('visibilitychange', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { try { localStorage.setItem(ACTIVE, state.activeId) } catch { /* ignore */ } }, [state.activeId])

  const board = state.boards.find((b) => b.id === state.activeId) ?? state.boards[0]

  const updateBoard = (fn: (b: Board) => Board) =>
    setState((s) => ({ ...s, boards: s.boards.map((b) => (b.id === board.id ? stampDone(fn(b)) : b)) }))

  return {
    state, board, updateBoard, sync, retry: flush,
    setActive: (id: string) => setState((s) => ({ ...s, activeId: id })),
    addBoard: (name: string) => {
      const b = newBoard(name)
      setState((s) => ({ boards: [...s.boards, b], activeId: b.id }))
    },
    deleteBoard: (id: string) =>
      setState((s) => {
        if (s.boards.length < 2) return s
        const boards = s.boards.filter((b) => b.id !== id)
        return { boards, activeId: boards[0].id }
      }),
    replaceAll: (next: State) => setState(normalize(next)),
  }
}
