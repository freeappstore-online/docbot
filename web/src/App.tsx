import { useEffect, useState } from 'react'
import { Shell } from './components/Shell.tsx'
import { Chat } from './components/Chat.tsx'
import { KeyPrompt } from './components/KeyPrompt.tsx'
import { getStoredKey } from './lib/anthropic'

export default function App() {
  const [hasKey, setHasKey] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    setHasKey(!!getStoredKey())
    setChecked(true)
  }, [])

  if (!checked) return <Shell><div className="flex-1" /></Shell>

  return (
    <Shell>
      {hasKey ? (
        <Chat onResetKey={() => setHasKey(false)} />
      ) : (
        <KeyPrompt onSaved={() => setHasKey(true)} />
      )}
    </Shell>
  )
}
