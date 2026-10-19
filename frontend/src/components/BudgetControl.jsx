import { useCallback, useEffect, useState } from 'react'
import { api, toKobo } from '../api/http'

export default function BudgetControl({ channel, onChanged }) {
  const [info, setInfo] = useState(null)
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(() => {
    api(`/seller/channels/${channel.id}/budget`)
      .then((d) => {
        setInfo(d)
        setVal(d.budget ? String(d.budget / 100) : '')
      })
      .catch(() => {})
  }, [channel.id])
  useEffect(() => {
    load()
  }, [load])

  if (!info || info.kind !== 'save') return null

  async function save(budget) {
    setBusy(true)
    setMsg('')
    try {
      await api(`/seller/channels/${channel.id}/budget`, { method: 'PUT', body: { budget } })
      setMsg(budget ? 'Saved. This applies to new customers.' : 'Basket mode is off.')
      load()
      onChanged?.()
    } catch (e) {
      setMsg(e.message)
    }
    setBusy(false)
  }

  return (
    <div className="bk-ctl">
      <b>Budget basket</b>
      <small className="muted">
        {info.budget
          ? `ON. Each customer fills a basket up to their budget with the items in this package, and pays the budget in installments. Any money left over is collected from you after delivery.`
          : 'Off. Customers pick one item each. Turn this on so customers can pick several items (shoe, cap, bag...) up to one budget.'}
      </small>
      <div className="bk-row">
        <input
          className="adm-search"
          style={{ height: 42, maxWidth: 180 }}
          inputMode="numeric"
          placeholder="Budget in naira, e.g. 20000"
          value={val}
          onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))}
        />
        <button className="db-btn sm" disabled={busy || !val} onClick={() => save(toKobo(val))}>{info.budget ? 'Save budget' : 'Turn on'}</button>
        {info.budget && <button className="db-btn sm ghost" disabled={busy} onClick={() => save(null)}>Turn off</button>}
      </div>
      {msg && <small className="muted">{msg}</small>}
    </div>
  )
}