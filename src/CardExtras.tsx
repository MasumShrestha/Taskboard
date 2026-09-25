import { useState } from 'react'
import { uid } from './store'
import Icon from './Icon'
import type { Attachment, Card, Checklist } from './types'

const MAX_FILE = 1_500_000 // localStorage is small; keep embedded files modest

export const progress = (flags: boolean[]) => (flags.length ? `${flags.filter(Boolean).length}/${flags.length}` : '')

function Bar({ flags }: { flags: boolean[] }) {
  if (!flags.length) return null
  const pct = Math.round((flags.filter(Boolean).length / flags.length) * 100)
  return <div className="bar" title={`${pct}%`}><div style={{ width: `${pct}%` }} /></div>
}

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form className="row" onSubmit={(e) => { e.preventDefault(); if (v.trim()) onAdd(v.trim()); setV('') }}>
      <input placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} /><button>Add</button>
    </form>
  )
}

export default function CardExtras({ card, onChange }: { card: Card; onChange: (p: Partial<Card>) => void }) {
  const subtasks = card.subtasks ?? []
  const checklists = card.checklists ?? []
  const attachments = card.attachments ?? []
  const [err, setErr] = useState('')

  const setList = (id: string, fn: (l: Checklist) => Checklist) =>
    onChange({ checklists: checklists.map((l) => (l.id === id ? fn(l) : l)) })

  const addFiles = (files: FileList | null) => {
    setErr('')
    const added: Attachment[] = []
    const list = Array.from(files ?? [])
    let pending = list.length
    if (!pending) return
    list.forEach((f) => {
      if (f.size > MAX_FILE) {
        setErr(`"${f.name}" is over ${(MAX_FILE / 1e6).toFixed(1)} MB. Add it as a link instead.`)
        if (--pending === 0 && added.length) onChange({ attachments: [...attachments, ...added] })
        return
      }
      const r = new FileReader()
      r.onload = () => {
        added.push({ id: uid(), name: f.name, url: String(r.result), size: f.size })
        if (--pending === 0) onChange({ attachments: [...attachments, ...added] })
      }
      r.readAsDataURL(f)
    })
  }
  const addLink = (url: string) => {
    const u = /^https?:\/\//i.test(url) ? url : `https://${url}`
    onChange({ attachments: [...attachments, { id: uid(), name: url, url: u }] })
  }

  return (
    <>
      <h3><Icon n="account_tree" />Subtasks {progress(subtasks.map((s) => s.done))}</h3>
      <Bar flags={subtasks.map((s) => s.done)} />
      <div className="items">
        {subtasks.map((s) => (
          <div key={s.id} className={`item${s.done ? ' done' : ''}`}>
            <input type="checkbox" checked={s.done} onChange={(e) => onChange({ subtasks: subtasks.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)) })} />
            <input className="item-text" value={s.title} onChange={(e) => onChange({ subtasks: subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })} />
            <button className="x" title="Remove" onClick={() => onChange({ subtasks: subtasks.filter((x) => x.id !== s.id) })}>×</button>
          </div>
        ))}
      </div>
      <AddRow placeholder="Add a subtask" onAdd={(title) => onChange({ subtasks: [...subtasks, { id: uid(), title, done: false }] })} />

      <h3><Icon n="checklist" />Checklists</h3>
      {checklists.map((l) => (
        <div key={l.id} className="checklist">
          <div className="cl-head">
            <input className="item-text cl-title" value={l.title} onChange={(e) => setList(l.id, (x) => ({ ...x, title: e.target.value }))} />
            <span className="muted">{progress(l.items.map((i) => i.done))}</span>
            <button className="x" title="Delete checklist" onClick={() => onChange({ checklists: checklists.filter((x) => x.id !== l.id) })}>×</button>
          </div>
          <Bar flags={l.items.map((i) => i.done)} />
          <div className="items">
            {l.items.map((i) => (
              <div key={i.id} className={`item${i.done ? ' done' : ''}`}>
                <input type="checkbox" checked={i.done} onChange={(e) => setList(l.id, (x) => ({ ...x, items: x.items.map((y) => (y.id === i.id ? { ...y, done: e.target.checked } : y)) }))} />
                <input className="item-text" value={i.text} onChange={(e) => setList(l.id, (x) => ({ ...x, items: x.items.map((y) => (y.id === i.id ? { ...y, text: e.target.value } : y)) }))} />
                <button className="x" title="Remove" onClick={() => setList(l.id, (x) => ({ ...x, items: x.items.filter((y) => y.id !== i.id) }))}>×</button>
              </div>
            ))}
          </div>
          <AddRow placeholder="Add an item" onAdd={(text) => setList(l.id, (x) => ({ ...x, items: [...x.items, { id: uid(), text, done: false }] }))} />
        </div>
      ))}
      <AddRow placeholder="New checklist title" onAdd={(title) => onChange({ checklists: [...checklists, { id: uid(), title, items: [] }] })} />

      <h3><Icon n="attach_file" />Attachments {attachments.length || ""}</h3>
      <div className="items">
        {attachments.map((a) => (
          <div key={a.id} className="item attach">
            <Icon n="description" />
            <a href={a.url} target="_blank" rel="noreferrer" download={a.url.startsWith('data:') ? a.name : undefined}>{a.name}</a>
            {a.size != null && <span className="muted">{a.size > 1e6 ? `${(a.size / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(a.size / 1e3))} KB`}</span>}
            <button className="x" title="Remove" onClick={() => onChange({ attachments: attachments.filter((x) => x.id !== a.id) })}>×</button>
          </div>
        ))}
      </div>
      <AddRow placeholder="Paste a link" onAdd={addLink} />
      <label className="upload">Upload file<input type="file" multiple onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} /></label>
      {err && <div className="err">{err}</div>}
    </>
  )
}
