export type Priority = 'none' | 'low' | 'medium' | 'high' | 'urgent'
export type FieldType = 'text' | 'number' | 'date' | 'select'

export interface FieldDef {
  id: string
  name: string
  type: FieldType
  options?: string[]
}
export interface Column { id: string; name: string }
export interface Subtask { id: string; title: string; done: boolean }
export interface ChecklistItem { id: string; text: string; done: boolean }
export interface Checklist { id: string; title: string; items: ChecklistItem[] }
export interface Attachment { id: string; name: string; url: string; size?: number } // url = link or data: URL
export interface Comment { id: string; author: string; text: string; at: string }
export interface Card {
  id: string
  columnId: string
  title: string
  description: string
  priority: Priority
  assignee: string
  due: string
  custom: Record<string, string>
  num?: number // per-board issue number, shown as KEY-num
  start?: string
  created?: string
  doneAt?: string // set automatically when the card enters the last column
  sprintId?: string // '' or missing = backlog
  points?: number
  labels?: string[]
  subtasks?: Subtask[]
  checklists?: Checklist[]
  attachments?: Attachment[]
  comments?: Comment[]
}
export interface Sprint { id: string; name: string; start: string; end: string; status: 'planned' | 'active' | 'done' }
export interface Board {
  id: string
  name: string
  columns: Column[]
  cards: Card[] // array order = order within a column
  members: string[]
  fields: FieldDef[]
  sprints: Sprint[]
  labels: string[]
  nextNum: number
}
export interface State { boards: Board[]; activeId: string }

export const PRIORITIES: Priority[] = ['none', 'low', 'medium', 'high', 'urgent']
export const PRIORITY_COLOR: Record<Priority, string> = {
  none: '#94a3b8', low: '#38bdf8', medium: '#facc15', high: '#fb923c', urgent: '#ef4444',
}
