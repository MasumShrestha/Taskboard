import { useEffect, useState } from 'react'
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

function load(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return normalize(JSON.parse(raw))
  } catch { /* ignore */ }
  const b = newBoard('My first board')
  return { boards: [b], activeId: b.id }
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

export function useStore() {
  const [state, setState] = useState<State>(load)
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* ignore */ }
  }, [state])

  const board = state.boards.find((b) => b.id === state.activeId) ?? state.boards[0]

  const updateBoard = (fn: (b: Board) => Board) =>
    setState((s) => ({ ...s, boards: s.boards.map((b) => (b.id === board.id ? stampDone(fn(b)) : b)) }))

  return {
    state, board, updateBoard,
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
