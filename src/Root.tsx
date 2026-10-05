import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import App from './TaskApp'
import { configured, supabase } from './supabase'
import { loadRemote, type Loaded } from './store'

function Center({ children }: { children: React.ReactNode }) {
  return <div className="auth-wrap">{children}</div>
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ err?: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    if (mode === 'in') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ err: true, text: error.message })
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) setMsg({ err: true, text: error.message })
      else if (!data.session) setMsg({ text: 'Check your email to confirm your account, then sign in.' })
    }
    setBusy(false)
  }

  return (
    <Center>
      <form className="auth-card" onSubmit={submit}>
        <div className="brand"><div className="logo">T</div><div><h1>Taskboard</h1><p>Agile velocity hub</p></div></div>
        <h2>{mode === 'in' ? 'Sign in' : 'Create your account'}</h2>
        <label>Email<input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Password<input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === 'in' ? 'current-password' : 'new-password'} /></label>
        {msg && <p className={`auth-msg${msg.err ? ' err' : ''}`}>{msg.text}</p>}
        <button className="cta" disabled={busy}>{busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Sign up'}</button>
        <button type="button" className="link" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setMsg(null) }}>
          {mode === 'in' ? 'No account? Sign up' : 'Have an account? Sign in'}
        </button>
      </form>
    </Center>
  )
}

function Workspace({ session }: { session: Session }) {
  const [initial, setInitial] = useState<Loaded | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    loadRemote(session.user.id).then(setInitial).catch((e) => setError(e.message ?? String(e)))
  }, [session.user.id])

  if (error) return <Center><div className="auth-card"><h2>Could not load your boards</h2><p className="auth-msg err">{error}</p>
    <p className="auth-msg">Did you run supabase/schema.sql in your project?</p></div></Center>
  if (!initial) return <Center><p className="auth-msg">Loading your boards…</p></Center>
  return <App initial={initial} userId={session.user.id} email={session.user.email ?? ''} onSignOut={() => supabase.auth.signOut()} />
}

export default function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (!configured) return <Center><div className="auth-card"><h2>Supabase is not configured</h2>
    <p className="auth-msg">Copy <code>.env.example</code> to <code>.env.local</code> and fill in your project URL and anon key, then restart.</p></div></Center>
  if (session === undefined) return <Center><p className="auth-msg">Loading…</p></Center>
  return session ? <Workspace key={session.user.id} session={session} /> : <AuthForm />
}
