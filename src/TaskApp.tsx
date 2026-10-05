import { useEffect, useRef, useState } from 'react'
import {
  DndContext, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import Icon from './Icon'
import { AskModal, CardModal, HelpModal, type Ask, NewCardModal, SettingsModal } from './Modals'
import { AnalyticsView, BacklogView, ListView, TimelineView, WorkspacesView } from './Views'
import {
  activeSprint, cardKey, diffDays, isDone, plain, progressOf, today, uid, useStore,
} from './store'
import type { Board, Card, Column, State } from './types'

type Store = ReturnType<typeof useStore>
type View = 'workspaces' | 'sprints' | 'backlog' | 'reports'
type Tab = 'board' | 'list' | 'timeline' | 'analytics'

const DOTS = ['var(--outline)', 'var(--primary-c)', 'var(--violet)', 'var(--ok)', 'var(--amber)']
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'board', label: 'Board', icon: 'dashboard' },
  { id: 'list', label: 'List', icon: 'table_rows' },
  { id: 'timeline', label: 'Timeline', icon: 'timeline' },
  { id: 'analytics', label: 'Analytics', icon: 'analytics' },
]
const ratio = (done: number, total: number) => `${done}/${total}`

export default function App() {
  const store = useStore()
  const { state, board, updateBoard } = store
  const [view, setView] = useState<View>('sprints')
  const [tab, setTab] = useState<Tab>('board')
  const [open, setOpen] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const [help, setHelp] = useState<null | 'docs' | 'support'>(null)
  const [adding, setAdding] = useState<null | { columnId: string; sprintId: string }>(null)
  const [query, setQuery] = useState('')
  const [fAssignee, setFAssignee] = useState('')
  const [fPriority, setFPriority] = useState('')
  const [fLabel, setFLabel] = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [notif, setNotif] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('taskboard:nav') === '1' } catch { return false } })
  const [ask, setAsk] = useState<Ask | null>(null)
  const [me, setMe] = useState(() => { try { return localStorage.getItem('taskboard:me') || 'Me' } catch { return 'Me' } })
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const searchRef = useRef<HTMLInputElement>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('theme', next) } catch { /* ignore */ }
  }
  const rename = () => setAsk({
    title: 'Your profile', label: 'Display name', initial: me,
    onSubmit: (n) => {
      setMe(n)
      try { localStorage.setItem('taskboard:me', n) } catch { /* ignore */ }
    },
  })
  const toggleNav = () => {
    if (window.matchMedia('(max-width: 860px)').matches) return setNavOpen((o) => !o)
    setCollapsed((c) => {
      try { localStorage.setItem('taskboard:nav', c ? '0' : '1') } catch { /* ignore */ }
      return !c
    })
  }

  // Ctrl/Cmd+K focuses the search box
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchRef.current?.focus() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])
  // deep links: #card=<id>
  useEffect(() => {
    const m = location.hash.match(/^#card=(\w+)/)
    if (!m) return
    const b = state.boards.find((x) => x.cards.some((c) => c.id === m[1]))
    if (b) { store.setActive(b.id); setOpen(m[1]); setView('sprints') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    history.replaceState(null, '', open ? `#card=${open}` : location.pathname + location.search)
  }, [open])

  const sprint = activeSprint(board)
  const inScope = (c: Card) => !!sprint && c.sprintId === sprint.id
  const q = query.trim().toLowerCase()
  const matches = (c: Card) =>
    (!q || [c.title, c.description, c.assignee, ...(c.labels ?? [])].some((s) => s?.toLowerCase().includes(q))) &&
    (!fAssignee || (fAssignee === '__none' ? !c.assignee : c.assignee === fAssignee)) &&
    (!fPriority || c.priority === fPriority) &&
    (!fLabel || !!c.labels?.includes(fLabel))
  const filtering = !!(fAssignee || fPriority || fLabel)
  const sprintCards = board.cards.filter(inScope).filter(matches)
  const backlogCount = board.cards.filter((c) => !c.sprintId).length

  const colOf = (id: string) => (id.startsWith('col:') ? id.slice(4) : board.cards.find((c) => c.id === id)?.columnId)
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    const target = colOf(String(over.id))
    const activeCard = board.cards.find((c) => c.id === active.id)
    if (!target || !activeCard || activeCard.columnId === target) return
    updateBoard((b) => {
      const from = b.cards.findIndex((c) => c.id === active.id)
      const moved = { ...b.cards[from], columnId: target }
      const rest = b.cards.filter((c) => c.id !== active.id)
      const overIdx = rest.findIndex((c) => c.id === over.id)
      rest.splice(overIdx < 0 ? rest.length : overIdx, 0, moved)
      return { ...b, cards: rest }
    })
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    updateBoard((b) => {
      const from = b.cards.findIndex((c) => c.id === active.id)
      const to = b.cards.findIndex((c) => c.id === over.id)
      if (from < 0 || to < 0 || b.cards[from].columnId !== b.cards[to].columnId) return b
      return { ...b, cards: arrayMove(b.cards, from, to) }
    })
  }

  const openCard = board.cards.find((c) => c.id === open)
  const openAdd = (sprintId?: string) => {
    if (!board.columns.length) return alert('Add a column first.')
    setAdding({ columnId: board.columns[0].id, sprintId: sprintId ?? sprint?.id ?? '' })
  }
  const addColumn = () => setAsk({
    title: 'Add column', label: 'Column name', cta: 'Add column',
    onSubmit: (n) => updateBoard((b) => ({ ...b, columns: [...b.columns, { id: uid(), name: n }] })),
  })
  const addBoard = () => setAsk({
    title: 'New board', label: 'Board name', cta: 'Create board',
    onSubmit: (n) => { store.addBoard(n); setView('sprints') },
  })
  const duplicate = (c: Card) => {
    const id = uid()
    updateBoard((b) => ({
      ...b, nextNum: b.nextNum + 1,
      cards: [...b.cards, { ...c, id, num: b.nextNum, title: `${c.title} (copy)`, comments: [], doneAt: undefined, created: today() }],
    }))
    setOpen(id)
  }
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = `taskboard-backup-${today()}.json`; a.click()
    URL.revokeObjectURL(url)
  }
  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as State
      if (!Array.isArray(data.boards) || !data.boards.length) throw new Error('no boards')
      if (confirm('Replace all current boards with this backup?')) { store.replaceAll(data); setHelp(null); setOpen(null) }
    } catch { alert('That file is not a valid Taskboard backup.') }
  }

  // notifications: overdue / due soon on the current board
  const t = today()
  const pending = board.cards.filter((c) => c.due && !isDone(board, c))
  const overdue = pending.filter((c) => c.due < t)
  const dueSoon = pending.filter((c) => c.due >= t && diffDays(c.due, t) <= 3)
  const bell = overdue.length + pending.filter((c) => c.due === t).length

  const viewTitle = { workspaces: 'Workspaces', sprints: 'Active sprint', backlog: 'Backlog', reports: 'Reports' }[view]
  const nav = (id: View, icon: string, label: string, extra?: React.ReactNode) => (
    <button className={`nav-item${view === id ? ' active' : ''}`} onClick={() => setView(id)}>
      <Icon n={icon} /><span>{label}</span>{extra}
    </button>
  )
  const day = sprint ? Math.min(Math.max(diffDays(t, sprint.start) + 1, 1), diffDays(sprint.end, sprint.start) + 1) : 0
  const dayTotal = sprint ? diffDays(sprint.end, sprint.start) + 1 : 0

  const empty = (
    <div className="empty">
      <Icon n="bolt" />
      <h3>No active sprint</h3>
      <p>Start a sprint from the backlog to see its cards here.</p>
      <button className="cta inline" onClick={() => setView('backlog')}>Go to backlog</button>
    </div>
  )

  return (
    <div className={`shell${collapsed ? ' collapsed' : ''}`}>
      {ask && <AskModal ask={ask} onClose={() => setAsk(null)} />}
      {navOpen && <div className="nav-mask" onClick={() => setNavOpen(false)} />}
      <aside className={`side${navOpen ? ' open' : ''}`}
        onClick={(e) => (e.target as HTMLElement).closest('.nav-item, .cta') && setNavOpen(false)}>
        <div className="brand">
          <div className="logo">T</div>
          <div><h1>Taskboard</h1><p>Agile velocity hub</p></div>
          <button className="icon-btn side-close" title="Hide sidebar" aria-label="Hide sidebar" onClick={toggleNav}><Icon n="left_panel_close" /></button>
        </div>
        <button className="cta" disabled={!board.columns.length} onClick={() => openAdd()}><Icon n="add" />Add task</button>
        <nav className="nav">
          {nav('workspaces', 'view_kanban', 'Workspaces')}
          {nav('sprints', 'bolt', 'Active sprints', sprint && <i className="pulse" />)}
          {nav('backlog', 'inventory_2', 'Backlog', <em>{backlogCount}</em>)}
          {nav('reports', 'insights', 'Reports')}
          <button className="nav-item" onClick={() => setSettings(true)}><Icon n="settings" /><span>Team settings</span></button>
        </nav>
        <div className="side-foot">
          <button className="nav-item" onClick={() => setHelp('docs')}><Icon n="menu_book" /><span>Documentation</span></button>
          <button className="nav-item" onClick={() => setHelp('support')}><Icon n="headset_mic" /><span>Support</span></button>
          <div className="profile">
            <span className="avatar big">{me.slice(0, 2).toUpperCase()}</span>
            <div><b>{me}</b><span>Workspace owner</span></div>
            <button className="icon-btn" title="Change name" onClick={rename}><Icon n="unfold_more" /></button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header>
          <div className="hleft">
          <button className="icon-btn menu-btn" title="Toggle sidebar" aria-label="Toggle sidebar" onClick={toggleNav}><Icon n="menu" /></button>
          <div className="switcher" title="Switch board">
            <Icon n="view_kanban" />
            <select value={board.id} aria-label="Board" onChange={(e) => { store.setActive(e.target.value); if (view === 'workspaces') setView('sprints') }}>
              {state.boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <Icon n="expand_more" className="chev" />
          </div>
          <button className="icon-btn" title="Rename board" onClick={() => {
            setAsk({ title: 'Rename board', label: 'Board name', initial: board.name, onSubmit: (n) => updateBoard((b) => ({ ...b, name: n })) })
          }}><Icon n="edit" /></button>
          {view === 'sprints' ? (
            <nav className="tabs-nav">
              {TABS.map((x) => (
                <button key={x.id} className={tab === x.id ? 'on' : ''} onClick={() => setTab(x.id)}><Icon n={x.icon} />{x.label}</button>
              ))}
            </nav>
          ) : <span className="view-title">{viewTitle}</span>}
          </div>
          <div className="hright">
          <div className="search">
            <Icon n="search" />
            <input ref={searchRef} placeholder="Search tasks, labels, assignees…" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())} />
            {query ? <button className="x" title="Clear" onClick={() => setQuery('')}>×</button> : <kbd>Ctrl K</kbd>}
          </div>
          {view === 'sprints' && (
            <button className={`icon-btn${showFilters ? ' on' : ''}${filtering ? ' dot' : ''}`} title="Toggle filters" onClick={() => setShowFilters((s) => !s)}><Icon n="filter_list" /></button>
          )}
          <div className="menu-anchor">
            <button className={`icon-btn${bell ? ' dot' : ''}`} title="Notifications" onClick={() => setNotif((n) => !n)}><Icon n="notifications" /></button>
            {notif && (
              <>
                <div className="pop-mask" onClick={() => setNotif(false)} />
                <div className="pop notif">
                  <h4>Notifications</h4>
                  {[['Overdue', overdue, 'late'], ['Due soon', dueSoon, '']].map(([label, list, cls]) => (list as Card[]).length > 0 && (
                    <div key={label as string}>
                      <p className={`n-label ${cls}`}>{label as string}</p>
                      {(list as Card[]).map((c) => (
                        <button key={c.id} onClick={() => { setNotif(false); setOpen(c.id) }}>
                          <span className="mono">{cardKey(board, c)}</span><span className="n-title">{c.title}</span><span className="muted">{c.due}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                  {!overdue.length && !dueSoon.length && <p className="muted pad">You're all caught up.</p>}
                </div>
              </>
            )}
          </div>
          <button className="icon-btn" title="Help" onClick={() => setHelp('docs')}><Icon n="help_outline" /></button>
          <button className="icon-btn" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle dark mode" onClick={toggleTheme}>
            <Icon n={theme === 'dark' ? 'light_mode' : 'dark_mode'} />
          </button>
          <span className="vsep" />
          <button className="primary" title="Add task" onClick={() => openAdd()}><Icon n="add" /><span className="lbl-txt">Add task</span></button>
          <button className="btn" title="Add column" onClick={addColumn}><Icon n="view_column" /><span className="lbl-txt">Add column</span></button>
          <button className="avatar me" title={`${me} — click to rename`} onClick={rename}>{me.slice(0, 2).toUpperCase()}</button>
          </div>
        </header>

        {view === 'sprints' && showFilters && (
          <div className="subbar">
            <span className={`chip-sprint${sprint ? '' : ' off'}`}>
              <i />{sprint ? `${sprint.name}: Day ${day} of ${dayTotal}` : 'No active sprint'}
            </span>
            <span className="vsep" />
            <label className="pill-select"><Icon n="person" />
              <select value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
                <option value="">Assignee: All</option><option value="__none">Unassigned</option>
                {board.members.map((m) => <option key={m}>{m}</option>)}
              </select><Icon n="arrow_drop_down" />
            </label>
            <label className="pill-select"><Icon n="flag" />
              <select value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
                <option value="">Priority: Any</option>
                {['urgent', 'high', 'medium', 'low', 'none'].map((p) => <option key={p}>{p}</option>)}
              </select><Icon n="arrow_drop_down" />
            </label>
            <label className="pill-select"><Icon n="label" />
              <select value={fLabel} onChange={(e) => setFLabel(e.target.value)}>
                <option value="">Label: Any</option>
                {board.labels.map((l) => <option key={l}>{l}</option>)}
              </select><Icon n="arrow_drop_down" />
            </label>
            {filtering && <button className="link" onClick={() => { setFAssignee(''); setFPriority(''); setFLabel('') }}>Clear filters</button>}
            <span className="grow" />
            {board.members.length > 0 && (
              <div className="stack" title={board.members.join(', ')}>
                {board.members.slice(0, 4).map((m) => <span key={m} className="avatar">{m.slice(0, 2).toUpperCase()}</span>)}
                {board.members.length > 4 && <span className="avatar more">+{board.members.length - 4}</span>}
              </div>
            )}
            <button className="link" onClick={() => {
              setAsk({ title: 'Invite a member', label: 'Name', cta: 'Invite', onSubmit: (n) => {
                if (!board.members.includes(n)) updateBoard((b) => ({ ...b, members: [...b.members, n] }))
              } })
            }}><Icon n="person_add" />Invite</button>
            <span className="vsep" />
            <button className="link danger" disabled={state.boards.length < 2} title="Delete board"
              onClick={() => confirm(`Delete board "${board.name}"?`) && store.deleteBoard(board.id)}><Icon n="delete_sweep" />Delete board</button>
          </div>
        )}

        <div className={`content${view === 'sprints' && tab === 'board' && sprint ? ' flush' : ''}`}>
          {view === 'workspaces' && (
            <WorkspacesView state={state} onOpen={(id) => { store.setActive(id); setView('sprints') }} onNew={addBoard} onDelete={store.deleteBoard} />
          )}
          {view === 'backlog' && <BacklogView board={board} update={updateBoard} onOpen={setOpen} onAdd={openAdd} filter={matches} />}
          {view === 'reports' && <AnalyticsView board={board} cards={board.cards} sprint={sprint} velocity />}
          {view === 'sprints' && !sprint && empty}
          {view === 'sprints' && sprint && tab === 'board' && (
            <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={onDragOver} onDragEnd={onDragEnd}>
              <div className="cols">
                {board.columns.map((col, i) => (
                  <ColumnView key={col.id} col={col} board={board} store={store} index={i} scope={(c) => inScope(c) && matches(c)}
                    onOpen={setOpen} onAdd={() => setAdding({ columnId: col.id, sprintId: sprint.id })} />
                ))}
                <button className="add-col" onClick={addColumn}><Icon n="add_circle" />Add column</button>
              </div>
            </DndContext>
          )}
          {view === 'sprints' && sprint && tab === 'list' && <ListView board={board} cards={sprintCards} update={updateBoard} onOpen={setOpen} />}
          {view === 'sprints' && sprint && tab === 'timeline' && <TimelineView board={board} cards={sprintCards} sprint={sprint} onOpen={setOpen} />}
          {view === 'sprints' && sprint && tab === 'analytics' && <AnalyticsView board={board} cards={sprintCards} sprint={sprint} />}
        </div>
      </div>

      {openCard && <CardModal card={openCard} board={board} me={me} update={updateBoard} onClose={() => setOpen(null)}
        onChange={(patch) => updateBoard((b) => ({ ...b, cards: b.cards.map((c) => (c.id === openCard.id ? { ...c, ...patch } : c)) }))}
        onDuplicate={() => duplicate(openCard)}
        onDelete={() => { updateBoard((b) => ({ ...b, cards: b.cards.filter((c) => c.id !== openCard.id) })); setOpen(null) }} />}
      {adding && <NewCardModal board={board} me={me} update={updateBoard} columnId={adding.columnId} sprintId={adding.sprintId} onClose={() => setAdding(null)}
        onCreate={(card) => { updateBoard((b) => ({ ...b, nextNum: b.nextNum + 1, cards: [...b.cards, { ...card, num: b.nextNum }] })); setAdding(null) }} />}
      {settings && <SettingsModal board={board} onClose={() => setSettings(false)} update={updateBoard} />}
      {help && <HelpModal tab={help} onClose={() => setHelp(null)} onExport={exportData} onImport={importData} />}
    </div>
  )
}

function ColumnView({ col, board, store, index, scope, onOpen, onAdd }: {
  col: Column; board: Board; store: Store; index: number; scope: (c: Card) => boolean
  onOpen: (id: string) => void; onAdd: () => void
}) {
  const { setNodeRef } = useDroppable({ id: `col:${col.id}` })
  const total = board.cards.filter((c) => c.columnId === col.id).length
  const cards = board.cards.filter((c) => c.columnId === col.id && scope(c))
  const move = (dir: -1 | 1) => store.updateBoard((b) => {
    const j = index + dir
    if (j < 0 || j >= b.columns.length) return b
    return { ...b, columns: arrayMove(b.columns, index, j) }
  })
  return (
    <section className="col">
      <div className="col-head">
        <span className="dot" style={{ background: DOTS[index % DOTS.length] }} />
        <input value={col.name} aria-label="Column name" onChange={(e) => store.updateBoard((b) => ({ ...b, columns: b.columns.map((c) => (c.id === col.id ? { ...c, name: e.target.value } : c)) }))} />
        <span className="count">{cards.length}</span>
        <button className="always" title="Add a card" onClick={onAdd}><Icon n="add" /></button>
        <button title="Move left" disabled={index === 0} onClick={() => move(-1)}><Icon n="chevron_left" /></button>
        <button title="Move right" disabled={index === board.columns.length - 1} onClick={() => move(1)}><Icon n="chevron_right" /></button>
        <button title="Delete column" onClick={() => {
          if (confirm(`Delete "${col.name}" and its ${total} card(s) (across all sprints)?`))
            store.updateBoard((b) => ({ ...b, columns: b.columns.filter((c) => c.id !== col.id), cards: b.cards.filter((c) => c.columnId !== col.id) }))
        }}><Icon n="delete" /></button>
      </div>
      <div ref={setNodeRef} className="col-body">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((c) => <CardView key={c.id} card={c} board={board} onOpen={onOpen} />)}
        </SortableContext>
      </div>
      <button className="add-card" onClick={onAdd}><Icon n="add" />Add a card</button>
    </section>
  )
}

function CardView({ card, board, onOpen }: { card: Card; board: Board; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const sub = card.subtasks ?? []
  const chk = card.checklists?.flatMap((l) => l.items) ?? []
  const p = progressOf(card)
  const files = card.attachments?.length ?? 0
  const comments = card.comments?.length ?? 0
  const done = isDone(board, card)
  const late = !!card.due && card.due < today() && !done
  return (
    <div ref={setNodeRef} className={`card${isDragging ? ' dragging' : ''}${done ? ' is-done' : ''}`} {...attributes} {...listeners} onClick={() => onOpen(card.id)}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      <div className="card-top">
        <div className="tags">
          {done
            ? <span className="badge p-done"><Icon n="done_all" />Completed</span>
            : card.priority !== 'none' && <span className={`badge p-${card.priority}`}>{card.priority}</span>}
          {card.labels?.slice(0, 2).map((l) => <span key={l} className="badge lbl-badge">{l}</span>)}
          {(card.labels?.length ?? 0) > 2 && <span className="badge lbl-badge">+{card.labels!.length - 2}</span>}
        </div>
        <span className="mono">{cardKey(board, card)}</span>
      </div>
      <h3>{card.title}</h3>
      {card.description && <p className="desc">{plain(card.description)}</p>}
      {p.total > 0 && (
        <div className="prog">
          <div className="prog-row"><span>Progress</span><b>{p.pct}%</b></div>
          <div className="bar"><div style={{ width: `${p.pct}%` }} /></div>
        </div>
      )}
      <div className="card-foot">
        <div className="stats">
          {card.due && <span className={late ? 'late' : ''} title="Due date"><Icon n="event" />{card.due.slice(5)}</span>}
          {sub.length > 0 && <span title="Subtasks"><Icon n="account_tree" />{ratio(sub.filter((s) => s.done).length, sub.length)}</span>}
          {chk.length > 0 && <span title="Checklist"><Icon n="check_box" />{ratio(chk.filter((i) => i.done).length, chk.length)}</span>}
          {files > 0 && <span title="Attachments"><Icon n="attach_file" />{files}</span>}
          {comments > 0 && <span title="Comments"><Icon n="chat_bubble_outline" />{comments}</span>}
          {!!card.points && <span className="pts" title="Story points">{card.points} pt</span>}
        </div>
        {card.assignee && <span className="avatar" title={card.assignee}>{card.assignee.slice(0, 2).toUpperCase()}</span>}
      </div>
    </div>
  )
}
