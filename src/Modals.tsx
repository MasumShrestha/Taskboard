import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CardExtras from './CardExtras'
import Icon from './Icon'
import { cardKey, uid } from './store'
import { PRIORITIES, type Board, type Card, type FieldDef, type FieldType } from './types'

type Update = (fn: (b: Board) => Board) => void

export function Modal({ children, onClose, wide, title, actions }: {
  children: React.ReactNode; onClose: () => void; wide?: boolean; title: React.ReactNode; actions?: React.ReactNode
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="crumbs">{title}</div>
          <div className="head-actions">
            {actions}
            <button className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}><Icon n="close" /></button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/* In-app replacement for window.prompt() */
export type Ask = { title: string; label: string; initial?: string; cta?: string; onSubmit: (v: string) => void }

export function AskModal({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const [v, setV] = useState(ask.initial ?? '')
  useEffect(() => {
    // capture + stopPropagation so Esc closes only this dialog, not a card modal beneath it
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [onClose])
  const submit = () => {
    const n = v.trim()
    if (!n) return
    ask.onSubmit(n)
    onClose()
  }
  return createPortal(
    <div className="overlay" style={{ zIndex: 80 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal ask" role="dialog" aria-modal="true" aria-label={ask.title}
        onSubmit={(e) => { e.preventDefault(); submit() }}>
        <div className="modal-head">
          <div className="crumbs"><b>{ask.title}</b></div>
          <button type="button" className="icon-btn" aria-label="Close" title="Close (Esc)" onClick={onClose}><Icon n="close" /></button>
        </div>
        <div className="modal-body">
          <label>{ask.label}
            <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
          </label>
        </div>
        <div className="ask-foot">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="cta inline" disabled={!v.trim()}>{ask.cta ?? 'Save'}</button>
        </div>
      </form>
    </div>,
    document.body,
  )
}

/* ------------------------------ card form ------------------------------ */
function CardForm({ card, board, me, onChange, update, isNew, onSubmit }: {
  card: Card; board: Board; me: string; onChange: (p: Partial<Card>) => void; update: Update; isNew?: boolean; onSubmit?: () => void
}) {
  const setCustom = (id: string, v: string) => onChange({ custom: { ...card.custom, [id]: v } })
  const ta = useRef<HTMLTextAreaElement>(null)
  const [comment, setComment] = useState('')
  const labels = card.labels ?? []
  const comments = card.comments ?? []

  const wrap = (before: string, after = before, lines = false) => {
    const el = ta.current
    if (!el) return
    const { selectionStart: s, selectionEnd: e, value } = el
    const sel = value.slice(s, e)
    const mid = lines ? (sel || '').split('\n').map((l) => before + l).join('\n') : before + sel + after
    onChange({ description: value.slice(0, s) + mid + value.slice(e) })
    requestAnimationFrame(() => { el.focus(); const p = sel ? s + mid.length : s + before.length; el.setSelectionRange(p, p) })
  }
  const toggleLabel = (l: string) => onChange({ labels: labels.includes(l) ? labels.filter((x) => x !== l) : [...labels, l] })
  const [askLabel, setAskLabel] = useState(false)
  const addLabel = (n: string) => {
    update((b) => ({ ...b, labels: b.labels.includes(n) ? b.labels : [...b.labels, n] }))
    if (!labels.includes(n)) onChange({ labels: [...labels, n] })
  }
  const newLabel = () => setAskLabel(true)
  const post = () => {
    if (!comment.trim()) return
    onChange({ comments: [...comments, { id: uid(), author: me, text: comment.trim(), at: new Date().toISOString() }] })
    setComment('')
  }

  return (
    <div className="detail">
      {askLabel && <AskModal ask={{ title: 'New label', label: 'Label name', cta: 'Add label', onSubmit: addLabel }} onClose={() => setAskLabel(false)} />}
      <div className="detail-main">
        <input className="modal-title" autoFocus={isNew} placeholder="Card title" value={card.title}
          onChange={(e) => onChange({ title: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && onSubmit?.()} />
        <div className="field">
          <div className="field-head">
            <span>Description</span>
            <div className="fmt">
              <button type="button" title="Bold" onClick={() => wrap('**')}><Icon n="format_bold" /></button>
              <button type="button" title="Italic" onClick={() => wrap('_')}><Icon n="format_italic" /></button>
              <button type="button" title="Bulleted list" onClick={() => wrap('- ', '', true)}><Icon n="format_list_bulleted" /></button>
              <button type="button" title="Code" onClick={() => wrap('`')}><Icon n="code" /></button>
            </div>
          </div>
          <textarea ref={ta} rows={4} placeholder="Add a more detailed description…" value={card.description} onChange={(e) => onChange({ description: e.target.value })} />
        </div>
        <CardExtras card={card} onChange={onChange} />
        <h3><Icon n="chat_bubble_outline" />Comments {comments.length || ''}</h3>
        <div className="comments">
          {comments.map((c) => (
            <div key={c.id} className="comment">
              <span className="avatar">{c.author.slice(0, 2).toUpperCase()}</span>
              <div className="c-body">
                <div className="c-meta"><b>{c.author}</b><span>{new Date(c.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
                <p>{c.text}</p>
              </div>
              <button className="x" title="Delete comment" onClick={() => onChange({ comments: comments.filter((x) => x.id !== c.id) })}>×</button>
            </div>
          ))}
        </div>
        <form className="row" onSubmit={(e) => { e.preventDefault(); post() }}>
          <input placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} /><button>Post</button>
        </form>
      </div>
      <aside className="detail-side">
        <label>Status<select value={card.columnId} onChange={(e) => onChange({ columnId: e.target.value })}>
          {board.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Priority<select value={card.priority} onChange={(e) => onChange({ priority: e.target.value as Card['priority'] })}>
          {PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label>Assignee<select value={card.assignee} onChange={(e) => onChange({ assignee: e.target.value })}>
          <option value="">Unassigned</option>{board.members.map((m) => <option key={m}>{m}</option>)}</select></label>
        <div className="two">
          <label>Start<input type="date" value={card.start ?? ''} onChange={(e) => onChange({ start: e.target.value })} /></label>
          <label>Due<input type="date" value={card.due} onChange={(e) => onChange({ due: e.target.value })} /></label>
        </div>
        <label>Sprint<select value={card.sprintId ?? ''} onChange={(e) => onChange({ sprintId: e.target.value })}>
          <option value="">Backlog</option>
          {board.sprints.filter((s) => s.status !== 'done' || s.id === card.sprintId).map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (active)' : ''}</option>)}
        </select></label>
        <label>Story points<input type="number" min={0} value={card.points ?? ''} placeholder="—"
          onChange={(e) => onChange({ points: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} /></label>
        <div className="field">
          <span className="lbl-title">Labels</span>
          <div className="chips">
            {board.labels.map((l) => <button key={l} type="button" className={`lbl${labels.includes(l) ? ' on' : ''}`} onClick={() => toggleLabel(l)}>{l}</button>)}
            <button type="button" className="lbl add" title="New label" onClick={newLabel}>+</button>
          </div>
        </div>
        {board.fields.map((f) => (
          <label key={f.id}>{f.name}
            {f.type === 'select'
              ? <select value={card.custom[f.id] ?? ''} onChange={(e) => setCustom(f.id, e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
              : <input type={f.type} value={card.custom[f.id] ?? ''} onChange={(e) => setCustom(f.id, e.target.value)} />}
          </label>
        ))}
      </aside>
    </div>
  )
}

export function CardModal({ card, board, me, onChange, update, onClose, onDelete, onDuplicate }: {
  card: Card; board: Board; me: string; onChange: (p: Partial<Card>) => void; update: Update
  onClose: () => void; onDelete: () => void; onDuplicate: () => void
}) {
  const [menu, setMenu] = useState(false)
  const [copied, setCopied] = useState(false)
  const sprint = board.sprints.find((s) => s.id === card.sprintId)
  const copy = () => {
    const url = `${location.origin}${location.pathname}#card=${card.id}`
    navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => prompt('Copy this link:', url))
  }
  return (
    <Modal onClose={onClose} wide
      title={<><span>{board.name}</span><Icon n="chevron_right" /><span>{sprint?.name ?? 'Backlog'}</span><Icon n="chevron_right" /><b className="mono">{cardKey(board, card)}</b></>}
      actions={<>
        <button className="icon-btn" title={copied ? 'Link copied' : 'Copy card link'} onClick={copy}><Icon n={copied ? 'check' : 'link'} /></button>
        <div className="menu-anchor">
          <button className="icon-btn" title="More" onClick={() => setMenu((m) => !m)}><Icon n="more_vert" /></button>
          {menu && (
            <>
              <div className="pop-mask" onClick={() => setMenu(false)} />
              <div className="pop menu">
                <button onClick={() => { setMenu(false); onDuplicate() }}><Icon n="content_copy" />Duplicate card</button>
                <button className="danger" onClick={() => { setMenu(false); confirm('Delete this card?') && onDelete() }}><Icon n="delete" />Delete card</button>
              </div>
            </>
          )}
        </div>
      </>}>
      <CardForm card={card} board={board} me={me} onChange={onChange} update={update} />
      <div className="actions">
        <button className="danger" onClick={() => confirm('Delete this card?') && onDelete()}><Icon n="delete" />Delete card</button>
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}

export function NewCardModal({ board, me, columnId, sprintId, update, onCreate, onClose }: {
  board: Board; me: string; columnId: string; sprintId: string; update: Update; onCreate: (c: Card) => void; onClose: () => void
}) {
  const [card, setCard] = useState<Card>({
    id: uid(), columnId, sprintId, title: '', description: '', priority: 'none', assignee: '', due: '', custom: {}, created: new Date().toLocaleDateString('en-CA'),
  })
  const submit = () => { if (card.title.trim()) onCreate({ ...card, title: card.title.trim() }) }
  return (
    <Modal onClose={onClose} wide title={<><Icon n="add_task" /><b>New card</b></>}>
      <CardForm card={card} board={board} me={me} update={update} isNew onSubmit={submit} onChange={(p) => setCard((c) => ({ ...c, ...p }))} />
      <div className="actions">
        <button onClick={onClose}>Cancel</button>
        <button disabled={!card.title.trim()} onClick={submit}>Create card</button>
      </div>
    </Modal>
  )
}

/* ------------------------------ team settings ------------------------------ */
export function SettingsModal({ board, update, onClose }: { board: Board; update: Update; onClose: () => void }) {
  const [member, setMember] = useState('')
  const [label, setLabel] = useState('')
  const [fname, setFname] = useState('')
  const [ftype, setFtype] = useState<FieldType>('text')
  const [fopts, setFopts] = useState('')
  const addField = () => {
    if (!fname.trim()) return
    const f: FieldDef = { id: uid(), name: fname.trim(), type: ftype, ...(ftype === 'select' ? { options: fopts.split(',').map((s) => s.trim()).filter(Boolean) } : {}) }
    update((b) => ({ ...b, fields: [...b.fields, f] }))
    setFname(''); setFopts('')
  }
  return (
    <Modal onClose={onClose} title={<><Icon n="settings" /><b>Team settings</b></>}>
      <h3>Members</h3>
      <div className="chips">{board.members.map((m) => (
        <span key={m} className="chip">{m}<button onClick={() => update((b) => ({ ...b, members: b.members.filter((x) => x !== m) }))}>×</button></span>))}</div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const m = member.trim(); if (m && !board.members.includes(m)) update((b) => ({ ...b, members: [...b.members, m] })); setMember('') }}>
        <input placeholder="Add member name" value={member} onChange={(e) => setMember(e.target.value)} /><button>Add</button>
      </form>
      <h3>Labels</h3>
      <div className="chips">{board.labels.map((l) => (
        <span key={l} className="chip">{l}<button onClick={() => update((b) => ({ ...b, labels: b.labels.filter((x) => x !== l), cards: b.cards.map((c) => ({ ...c, labels: c.labels?.filter((x) => x !== l) })) }))}>×</button></span>))}</div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const l = label.trim(); if (l && !board.labels.includes(l)) update((b) => ({ ...b, labels: [...b.labels, l] })); setLabel('') }}>
        <input placeholder="Add label" value={label} onChange={(e) => setLabel(e.target.value)} /><button>Add</button>
      </form>
      <h3>Custom fields</h3>
      <div className="chips">{board.fields.map((f) => (
        <span key={f.id} className="chip">{f.name} ({f.type})<button onClick={() => update((b) => ({ ...b, fields: b.fields.filter((x) => x.id !== f.id) }))}>×</button></span>))}</div>
      <div className="row">
        <input placeholder="Field name" value={fname} onChange={(e) => setFname(e.target.value)} />
        <select value={ftype} onChange={(e) => setFtype(e.target.value as FieldType)}>
          {(['text', 'number', 'date', 'select'] as FieldType[]).map((t) => <option key={t}>{t}</option>)}</select>
        {ftype === 'select' && <input placeholder="Options, comma separated" value={fopts} onChange={(e) => setFopts(e.target.value)} />}
        <button onClick={addField}>Add</button>
      </div>
      <div className="actions"><span /><button onClick={onClose}>Done</button></div>
    </Modal>
  )
}

/* ------------------------------ help / docs / support ------------------------------ */
export function HelpModal({ tab: initial, onClose, onExport, onImport }: {
  tab: 'docs' | 'support'; onClose: () => void; onExport: () => void; onImport: (file: File) => void
}) {
  const [tab, setTab] = useState(initial)
  return (
    <Modal onClose={onClose} title={<><Icon n={tab === 'docs' ? 'menu_book' : 'headset_mic'} /><b>{tab === 'docs' ? 'Documentation' : 'Support'}</b></>}>
      <div className="tabs">
        <button className={tab === 'docs' ? 'on' : ''} onClick={() => setTab('docs')}>Documentation</button>
        <button className={tab === 'support' ? 'on' : ''} onClick={() => setTab('support')}>Support</button>
      </div>
      {tab === 'docs' ? (
        <div className="doc">
          <h3>Views</h3>
          <p><b>Board</b> is the kanban of the active sprint. <b>List</b> is a sortable table with inline editing. <b>Timeline</b> lays cards out by start and due date. <b>Analytics</b> shows the burndown, status, priority and workload.</p>
          <h3>Sprints &amp; backlog</h3>
          <p>Cards without a sprint live in the <b>Backlog</b>. Create sprints there, choose a sprint on each row, then press <b>Start</b>. Only one sprint is active at a time. <b>Complete</b> moves unfinished cards back to the backlog.</p>
          <h3>Done</h3>
          <p>The last column of a board counts as "done". Moving a card into it stamps the completion date used by the burndown chart.</p>
          <h3>Cards</h3>
          <p>Every card has subtasks, checklists, attachments, comments, labels, story points and custom fields. Use the link button in a card to copy a shareable link.</p>
          <h3>Keyboard shortcuts</h3>
          <p><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> focus search · <kbd>Esc</kbd> close a dialog · <kbd>Enter</kbd> create a card from the title field.</p>
        </div>
      ) : (
        <div className="doc">
          <h3>Where is my data?</h3>
          <p>Everything is stored in this browser (local storage). Clearing site data removes it, so export a backup now and then.</p>
          <div className="row">
            <button onClick={onExport}><Icon n="download" />Export backup</button>
            <label className="btn-like"><Icon n="upload" />Import backup
              <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = '' }} />
            </label>
          </div>
          <h3>Uploads</h3>
          <p>Attached files are embedded in the browser storage, so they are limited to about 1.5 MB each. For bigger files, attach a link.</p>
        </div>
      )}
    </Modal>
  )
}
