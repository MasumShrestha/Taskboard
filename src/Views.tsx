import { useState } from 'react'
import Icon from './Icon'
import {
  activeSprint, addDays, cardKey, diffDays, isDone, newSprint, progressOf, today, weight,
} from './store'
import { PRIORITIES, PRIORITY_COLOR, type Board, type Card, type Sprint, type State } from './types'

type Update = (fn: (b: Board) => Board) => void
type Open = (id: string) => void

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })
const cmp = (a: number | string, b: number | string) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))

/* =============================== LIST =============================== */
export function ListView({ board, cards, update, onOpen, showSprint }: {
  board: Board; cards: Card[]; update: Update; onOpen: Open; showSprint?: boolean
}) {
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 } | null>(null)
  const patch = (id: string, p: Partial<Card>) => update((b) => ({ ...b, cards: b.cards.map((c) => (c.id === id ? { ...c, ...p } : c)) }))
  const val = (c: Card, k: string): number | string => {
    switch (k) {
      case 'id': return c.num ?? 0
      case 'title': return c.title.toLowerCase()
      case 'status': return board.columns.findIndex((x) => x.id === c.columnId)
      case 'priority': return PRIORITIES.indexOf(c.priority)
      case 'assignee': return c.assignee.toLowerCase()
      case 'due': return c.due || '9999-12-31'
      case 'points': return c.points ?? 0
      default: return progressOf(c).pct
    }
  }
  const rows = sort ? [...cards].sort((a, b) => cmp(val(a, sort.k), val(b, sort.k)) * sort.dir) : cards
  const head = (k: string, label: string) => (
    <th>
      <button className="th" onClick={() => setSort((s) => (s?.k === k ? (s.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }))}>
        {label}{sort?.k === k && <Icon n={sort.dir === 1 ? 'arrow_upward' : 'arrow_downward'} />}
      </button>
    </th>
  )
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const t = today()
  return (
    <div className="table-wrap">
      <table className="list">
        <thead>
          <tr>{head('id', 'ID')}{head('title', 'Title')}{head('status', 'Status')}{head('priority', 'Priority')}{head('assignee', 'Assignee')}
            {head('due', 'Due')}{head('points', 'Pts')}{head('progress', 'Progress')}{showSprint && <th>Sprint</th>}</tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const p = progressOf(c)
            const late = !!c.due && c.due < t && !isDone(board, c)
            return (
              <tr key={c.id} className={isDone(board, c) ? 'done' : ''} onClick={() => onOpen(c.id)}>
                <td className="mono">{cardKey(board, c)}</td>
                <td className="t-title">{c.title}</td>
                <td onClick={stop}>
                  <select value={c.columnId} onChange={(e) => patch(c.id, { columnId: e.target.value })}>
                    {board.columns.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                </td>
                <td onClick={stop}>
                  <select className={`sel-p p-${c.priority}`} value={c.priority} onChange={(e) => patch(c.id, { priority: e.target.value as Card['priority'] })}>
                    {PRIORITIES.map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <td onClick={stop}>
                  <select value={c.assignee} onChange={(e) => patch(c.id, { assignee: e.target.value })}>
                    <option value="">Unassigned</option>
                    {board.members.map((m) => <option key={m}>{m}</option>)}
                  </select>
                </td>
                <td className={late ? 'late' : ''}>{c.due ? fmt(c.due) : '—'}</td>
                <td>{c.points ?? '—'}</td>
                <td>{p.total ? <div className="mini"><div className="bar"><div style={{ width: `${p.pct}%` }} /></div><span>{p.pct}%</span></div> : '—'}</td>
                {showSprint && (
                  <td onClick={stop}>
                    <select value={c.sprintId ?? ''} onChange={(e) => patch(c.id, { sprintId: e.target.value })}>
                      <option value="">Backlog</option>
                      {board.sprints.filter((s) => s.status !== 'done').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                )}
              </tr>
            )
          })}
          {!rows.length && <tr className="none"><td colSpan={showSprint ? 9 : 8}>Nothing here yet.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

/* ============================== TIMELINE ============================== */
export function TimelineView({ board, cards, sprint, onOpen }: { board: Board; cards: Card[]; sprint?: Sprint; onOpen: Open }) {
  const t = today()
  const dated = cards.filter((c) => c.due)
  const loose = cards.filter((c) => !c.due)
  const startOf = (c: Card) => {
    const s = c.start || c.created || sprint?.start || c.due
    return s > c.due ? c.due : s
  }
  const starts = [t, ...(sprint ? [sprint.start] : []), ...dated.map(startOf)]
  const ends = [t, ...(sprint ? [sprint.end] : []), ...dated.map((c) => c.due)]
  const min = starts.reduce((a, b) => (b < a ? b : a))
  const max = ends.reduce((a, b) => (b > a ? b : a))
  const days = Math.min(diffDays(max, min) + 1, 240)
  const W = 34
  const list = Array.from({ length: days }, (_, i) => addDays(min, i))
  const sorted = [...dated].sort((a, b) => startOf(a).localeCompare(startOf(b)))
  return (
    <div className="tl">
      <div className="tl-scroll">
        <div className="tl-inner" style={{ width: 240 + days * W }}>
          <div className="tl-row tl-headrow">
            <div className="tl-label"><b>{fmt(min)} – {fmt(max)}</b></div>
            <div className="tl-days">
              {list.map((d) => {
                const dt = new Date(`${d}T00:00:00`)
                const wk = dt.getDay() === 0 || dt.getDay() === 6
                return (
                  <div key={d} title={d} className={`tl-day${wk ? ' wk' : ''}${d === t ? ' today' : ''}`} style={{ width: W }}>
                    <small>{dt.toLocaleDateString('en', { weekday: 'narrow' })}</small><b>{dt.getDate()}</b>
                  </div>
                )
              })}
            </div>
          </div>
          {sorted.map((c) => {
            const s = startOf(c)
            const left = diffDays(s, min) * W
            const width = (diffDays(c.due, s) + 1) * W
            return (
              <div key={c.id} className="tl-row" onClick={() => onOpen(c.id)}>
                <div className="tl-label"><span className="mono">{cardKey(board, c)}</span><span className="tl-name">{c.title}</span></div>
                <div className="tl-track" style={{ backgroundSize: `${W}px 100%` }}>
                  <div className={`tl-bar${isDone(board, c) ? ' done' : ''}`} style={{ left, width, borderLeftColor: PRIORITY_COLOR[c.priority] }}
                    title={`${fmt(s)} → ${fmt(c.due)}`}>{c.title}</div>
                </div>
              </div>
            )
          })}
          {!sorted.length && <div className="tl-empty">Give cards a due date (and optionally a start date) to see them on the timeline.</div>}
          {t >= min && t <= max && <div className="tl-today" style={{ left: 240 + diffDays(t, min) * W + W / 2 }} />}
        </div>
      </div>
      {loose.length > 0 && (
        <div className="tl-loose">
          <h4>No due date · {loose.length}</h4>
          <div className="chips">
            {loose.map((c) => <button key={c.id} className="chip-btn" onClick={() => onOpen(c.id)}><span className="mono">{cardKey(board, c)}</span> {c.title}</button>)}
          </div>
        </div>
      )}
    </div>
  )
}

/* ============================== ANALYTICS ============================== */
function Bars({ rows, color }: { rows: { label: string; n: number; color?: string }[]; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.label} className="hbar">
          <span className="hb-label">{r.label}</span>
          <div className="hb-track"><div style={{ width: `${(r.n / max) * 100}%`, background: r.color ?? color ?? 'var(--primary-c)' }} /></div>
          <b>{r.n}</b>
        </div>
      ))}
      {!rows.length && <p className="muted">No data</p>}
    </div>
  )
}

function Burndown({ cards, sprint }: { cards: Card[]; sprint: Sprint }) {
  const n = Math.max(diffDays(sprint.end, sprint.start) + 1, 2)
  const total = cards.reduce((a, c) => a + weight(c), 0)
  if (!total) return <p className="muted">Add cards to this sprint to see the burndown.</p>
  const t = today()
  const W = 600, H = 210, L = 38, R = 12, T = 12, B = 28
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1)
  const y = (v: number) => T + (H - T - B) * (1 - v / total)
  const dates = Array.from({ length: n }, (_, i) => addDays(sprint.start, i))
  const remaining = (d: string) => total - cards.filter((c) => c.doneAt !== undefined && c.doneAt <= d).reduce((a, c) => a + weight(c), 0)
  const actual = dates.map((d, i) => (d <= t ? { i, v: remaining(d) } : null)).filter((p): p is { i: number; v: number } => !!p)
  const step = Math.ceil(n / 7)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sprint burndown">
      {[0, .25, .5, .75, 1].map((f) => (
        <g key={f}>
          <line x1={L} x2={W - R} y1={y(total * f)} y2={y(total * f)} className="grid-line" />
          <text x={L - 6} y={y(total * f) + 4} textAnchor="end">{Math.round(total * f)}</text>
        </g>
      ))}
      {dates.map((d, i) => i % step === 0 && <text key={d} x={x(i)} y={H - 8} textAnchor="middle">{fmt(d)}</text>)}
      <line x1={x(0)} y1={y(total)} x2={x(n - 1)} y2={y(0)} className="ideal" />
      {actual.length > 0 && <polyline className="actual" points={actual.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />}
      {actual.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="3" className="actual-dot" />)}
    </svg>
  )
}

export function AnalyticsView({ board, cards, sprint, velocity }: { board: Board; cards: Card[]; sprint?: Sprint; velocity?: boolean }) {
  const t = today()
  const done = cards.filter((c) => isDone(board, c))
  const overdue = cards.filter((c) => c.due && c.due < t && !isDone(board, c))
  const pts = cards.reduce((a, c) => a + (c.points ?? 0), 0)
  const ptsDone = done.reduce((a, c) => a + (c.points ?? 0), 0)
  const byStatus = board.columns.map((c) => ({ label: c.name, n: cards.filter((x) => x.columnId === c.id).length }))
  const byPriority = [...PRIORITIES].reverse().map((p) => ({ label: p, n: cards.filter((c) => c.priority === p).length, color: PRIORITY_COLOR[p] }))
  const people = [...board.members, ''].map((m) => ({ label: m || 'Unassigned', n: cards.filter((c) => c.assignee === m).length })).filter((r) => r.n)
  const finished = board.sprints.filter((s) => s.status === 'done')
  const velo = finished.map((s) => ({ label: s.name, n: board.cards.filter((c) => c.sprintId === s.id).reduce((a, c) => a + weight(c), 0) }))
  const kpis = [
    { label: 'Total cards', v: cards.length, icon: 'stacks' },
    { label: 'Completed', v: `${done.length}${cards.length ? ` · ${Math.round((done.length / cards.length) * 100)}%` : ''}`, icon: 'task_alt' },
    { label: 'Open', v: cards.length - done.length, icon: 'pending_actions' },
    { label: 'Overdue', v: overdue.length, icon: 'warning', bad: overdue.length > 0 },
    { label: 'Story points', v: pts ? `${ptsDone}/${pts}` : '—', icon: 'bolt' },
  ]
  return (
    <div className="analytics">
      <div className="kpis">
        {kpis.map((k) => (
          <div key={k.label} className={`kpi${k.bad ? ' bad' : ''}`}><Icon n={k.icon} /><div><b>{k.v}</b><span>{k.label}</span></div></div>
        ))}
      </div>
      <div className="an-grid">
        {sprint && (
          <section className="panel wide">
            <h4>Burndown · {sprint.name}</h4>
            <Burndown cards={cards} sprint={sprint} />
            <p className="legend"><i className="sw ideal-sw" /> Ideal <i className="sw actual-sw" /> Remaining {cards.some((c) => c.points) ? '(story points)' : '(cards)'}</p>
          </section>
        )}
        <section className="panel"><h4>Cards by status</h4><Bars rows={byStatus} /></section>
        <section className="panel"><h4>Cards by priority</h4><Bars rows={byPriority} /></section>
        <section className="panel"><h4>Workload by assignee</h4><Bars rows={people} color="var(--violet)" /></section>
        {velocity && (
          <section className="panel"><h4>Velocity · completed sprints</h4>
            {velo.length ? <Bars rows={velo} color="var(--ok)" /> : <p className="muted">Complete a sprint to see velocity.</p>}
          </section>
        )}
      </div>
    </div>
  )
}

/* ============================== BACKLOG ============================== */
export function BacklogView({ board, update, onOpen, onAdd, filter }: {
  board: Board; update: Update; onOpen: Open; onAdd: (sprintId: string) => void; filter: (c: Card) => boolean
}) {
  const patchSprint = (id: string, p: Partial<Sprint>) => update((b) => ({ ...b, sprints: b.sprints.map((s) => (s.id === id ? { ...s, ...p } : s)) }))
  const live = board.sprints.filter((s) => s.status !== 'done').sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0))
  const finished = board.sprints.filter((s) => s.status === 'done')
  const hasActive = !!activeSprint(board)
  const complete = (s: Sprint) => {
    const open = board.cards.filter((c) => c.sprintId === s.id && !isDone(board, c)).length
    if (!confirm(`Complete "${s.name}"? ${open} unfinished card(s) will move back to the backlog.`)) return
    update((b) => ({
      ...b,
      sprints: b.sprints.map((x) => (x.id === s.id ? { ...x, status: 'done' } : x)),
      cards: b.cards.map((c) => (c.sprintId === s.id && !isDone(b, c) ? { ...c, sprintId: '' } : c)),
    }))
  }
  const remove = (s: Sprint) => {
    if (!confirm(`Delete "${s.name}"? Its cards move to the backlog.`)) return
    update((b) => ({ ...b, sprints: b.sprints.filter((x) => x.id !== s.id), cards: b.cards.map((c) => (c.sprintId === s.id ? { ...c, sprintId: '' } : c)) }))
  }
  const section = (key: string, title: React.ReactNode, cards: Card[], sprintId: string) => (
    <section className="panel backlog-sec" key={key}>
      <div className="sec-head">{title}</div>
      <ListView board={board} cards={cards.filter(filter)} update={update} onOpen={onOpen} showSprint />
      <button className="add-card" onClick={() => onAdd(sprintId)}><Icon n="add" />Add a card</button>
    </section>
  )
  return (
    <div className="backlog">
      <div className="bl-bar">
        <p className="muted">Plan sprints, then drag work in by choosing a sprint on each row.</p>
        <button className="btn" onClick={() => update((b) => ({ ...b, sprints: [...b.sprints, newSprint(`Sprint ${b.sprints.length + 1}`)] }))}><Icon n="add" />New sprint</button>
      </div>
      {live.map((s) => section(s.id, (
        <>
          <input className="sp-name" value={s.name} onChange={(e) => patchSprint(s.id, { name: e.target.value })} aria-label="Sprint name" />
          <span className={`badge st-${s.status}`}>{s.status}</span>
          <input type="date" value={s.start} onChange={(e) => e.target.value && patchSprint(s.id, { start: e.target.value })} aria-label="Start" />
          <span className="muted">→</span>
          <input type="date" value={s.end} onChange={(e) => e.target.value && patchSprint(s.id, { end: e.target.value })} aria-label="End" />
          <span className="grow" />
          <span className="muted">{board.cards.filter((c) => c.sprintId === s.id).length} cards</span>
          {s.status === 'planned'
            ? <button className="btn" disabled={hasActive} title={hasActive ? 'Complete the active sprint first' : 'Start sprint'} onClick={() => patchSprint(s.id, { status: 'active' })}><Icon n="play_arrow" />Start</button>
            : <button className="btn" onClick={() => complete(s)}><Icon n="flag" />Complete</button>}
          <button className="x" title="Delete sprint" onClick={() => remove(s)}><Icon n="delete" /></button>
        </>
      ), board.cards.filter((c) => c.sprintId === s.id), s.id))}
      {section('backlog', <><h4>Backlog</h4><span className="muted">{board.cards.filter((c) => !c.sprintId).length} cards</span></>, board.cards.filter((c) => !c.sprintId), '')}
      {finished.length > 0 && (
        <section className="panel">
          <div className="sec-head"><h4>Completed sprints</h4></div>
          {finished.map((s) => {
            const n = board.cards.filter((c) => c.sprintId === s.id)
            return (
              <div key={s.id} className="done-sprint">
                <Icon n="check_circle" /><b>{s.name}</b><span className="muted">{fmt(s.start)} – {fmt(s.end)}</span>
                <span className="grow" /><span className="muted">{n.length} cards · {n.reduce((a, c) => a + weight(c), 0)} pts</span>
                <button className="x" title="Delete sprint" onClick={() => remove(s)}><Icon n="delete" /></button>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}

/* ============================== WORKSPACES ============================== */
export function WorkspacesView({ state, onOpen, onNew, onDelete }: {
  state: State; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void
}) {
  return (
    <div className="workspaces">
      {state.boards.map((b) => {
        const done = b.cards.filter((c) => isDone(b, c)).length
        const pct = b.cards.length ? Math.round((done / b.cards.length) * 100) : 0
        const sp = activeSprint(b)
        return (
          <div key={b.id} className={`ws-card${b.id === state.activeId ? ' current' : ''}`} onClick={() => onOpen(b.id)} role="button" tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onOpen(b.id)}>
            <div className="ws-top"><div className="logo sm">{b.name.slice(0, 1).toUpperCase() || 'B'}</div>
              <button className="x" title="Delete board" disabled={state.boards.length < 2}
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete board "${b.name}"?`)) onDelete(b.id) }}><Icon n="delete" /></button></div>
            <h3>{b.name}</h3>
            <p className="muted">{sp ? `${sp.name} · active` : 'No active sprint'}</p>
            <div className="prog-row"><span>{done}/{b.cards.length} done</span><b>{pct}%</b></div>
            <div className="bar"><div style={{ width: `${pct}%` }} /></div>
            <div className="ws-meta"><span><Icon n="view_column" />{b.columns.length}</span><span><Icon n="group" />{b.members.length}</span><span><Icon n="event_repeat" />{b.sprints.length}</span></div>
          </div>
        )
      })}
      <button className="add-col ws-new" onClick={onNew}><Icon n="add_circle" />New board</button>
    </div>
  )
}
