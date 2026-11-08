import { useState, useEffect, useCallback } from 'react'
import { getApartmentHistory, updateOwnershipHistory, deleteOwnershipHistory } from '../api'
import { useModal } from '../context/ModalContext'

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

interface Props {
  apartmentId: number
  onClose: () => void
}

export default function ApartmentHistory({ apartmentId, onClose }: Props) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [selectedCell, setSelectedCell] = useState<{ year: number; month: number } | null>(null)
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null)
  const [historyForm, setHistoryForm] = useState({ owner_name: '', from_month: '', from_year: '', to_month: '', to_year: '' })
  const { showAlert, showConfirm } = useModal()

  const reload = useCallback(() => {
    setLoading(true)
    getApartmentHistory(apartmentId).then(setData).finally(() => setLoading(false))
  }, [apartmentId])

  useEffect(() => { reload() }, [reload])

  const startEditHistory = (h: any) => {
    setEditingHistoryId(h.id)
    setHistoryForm({
      owner_name: h.owner_name,
      from_month: String(h.from_month),
      from_year: String(h.from_year),
      to_month: h.to_month ? String(h.to_month) : '',
      to_year: h.to_year ? String(h.to_year) : '',
    })
  }

  const handleSaveHistory = async (historyId: number) => {
    try {
      await updateOwnershipHistory(apartmentId, historyId, {
        owner_name: historyForm.owner_name,
        from_month: Number(historyForm.from_month),
        from_year: Number(historyForm.from_year),
        to_month: historyForm.to_month ? Number(historyForm.to_month) : null,
        to_year: historyForm.to_year ? Number(historyForm.to_year) : null,
      })
      setEditingHistoryId(null)
      reload()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בעדכון')
    }
  }

  const handleDeleteHistory = async (historyId: number) => {
    if (!await showConfirm('למחוק רשומת דייר קודם זו?')) return
    try {
      await deleteOwnershipHistory(apartmentId, historyId)
      reload()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-500">טוען...</div>
  if (!data) return <div className="text-center py-10 text-gray-400">לא נמצאו נתונים</div>

  const { apartment, ownership_history, years, special_payments } = data
  const yearKeys = Object.keys(years).map(Number).sort((a, b) => b - a)

  const statusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-200 text-green-800 hover:bg-green-300'
      case 'partial': return 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
      case 'unpaid': return 'bg-red-200 text-red-800 hover:bg-red-300'
      default: return 'bg-gray-100'
    }
  }

  const cellPayments = selectedCell
    ? years[selectedCell.year]?.[selectedCell.month]
    : null

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">
          היסטוריית דירה {apartment.number} — {apartment.owner_name}
        </h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
      </div>

      {ownership_history.length > 0 && (
        <div className="mb-6 p-3 bg-gray-50 rounded">
          <h3 className="text-sm font-bold mb-2">דיירים קודמים</h3>
          <div className="space-y-2">
            {ownership_history.map((h: any) => (
              editingHistoryId === h.id ? (
                <div key={h.id} className="bg-white border rounded p-3 space-y-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium mb-0.5">שם *</label>
                      <input
                        value={historyForm.owner_name}
                        onChange={e => setHistoryForm({ ...historyForm, owner_name: e.target.value })}
                        className="w-full border rounded px-2 py-1 text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.5">מחודש *</label>
                      <div className="flex gap-1">
                        <select
                          value={historyForm.from_month}
                          onChange={e => setHistoryForm({ ...historyForm, from_month: e.target.value })}
                          className="border rounded px-1 py-1 text-sm flex-1"
                        >
                          {MONTH_NAMES.map((name, i) => (
                            <option key={i + 1} value={i + 1}>{name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={historyForm.from_year}
                          onChange={e => setHistoryForm({ ...historyForm, from_year: e.target.value })}
                          className="border rounded px-1 py-1 text-sm w-20"
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-0.5">עד חודש</label>
                      <div className="flex gap-1">
                        <select
                          value={historyForm.to_month}
                          onChange={e => setHistoryForm({ ...historyForm, to_month: e.target.value })}
                          className="border rounded px-1 py-1 text-sm flex-1"
                        >
                          <option value="">—</option>
                          {MONTH_NAMES.map((name, i) => (
                            <option key={i + 1} value={i + 1}>{name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={historyForm.to_year}
                          onChange={e => setHistoryForm({ ...historyForm, to_year: e.target.value })}
                          className="border rounded px-1 py-1 text-sm w-20"
                          dir="ltr"
                          placeholder="שנה"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveHistory(h.id)}
                      className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                    >
                      שמירה
                    </button>
                    <button
                      onClick={() => setEditingHistoryId(null)}
                      className="bg-gray-200 text-gray-700 px-3 py-1 rounded text-sm hover:bg-gray-300"
                    >
                      ביטול
                    </button>
                  </div>
                </div>
              ) : (
                <div key={h.id} className="text-sm text-gray-600 flex items-center gap-2">
                  <span className="font-medium">{h.owner_name}</span>
                  <span className="text-gray-400">
                    ({MONTH_NAMES[h.from_month - 1]} {h.from_year} — {h.to_month ? `${MONTH_NAMES[h.to_month - 1]} ${h.to_year}` : 'עד היום'})
                  </span>
                  <button
                    onClick={() => startEditHistory(h)}
                    className="text-blue-500 hover:underline text-xs"
                  >
                    עריכה
                  </button>
                  <button
                    onClick={() => handleDeleteHistory(h.id)}
                    className="text-red-500 hover:underline text-xs"
                  >
                    מחיקה
                  </button>
                </div>
              )
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {yearKeys.map(year => {
          const months = years[year]
          const monthKeys = Object.keys(months).map(Number).sort((a, b) => a - b)
          return (
            <div key={year}>
              <h3 className="text-sm font-bold mb-2">{year}</h3>
              <div className="grid grid-cols-12 gap-1">
                {monthKeys.map(m => {
                  const cell = months[m]
                  const isSelected = selectedCell?.year === year && selectedCell?.month === m
                  return (
                    <button
                      key={m}
                      onClick={() => setSelectedCell(isSelected ? null : { year, month: m })}
                      className={`p-1.5 rounded text-xs text-center cursor-pointer transition-colors ${statusColor(cell.status)} ${isSelected ? 'ring-2 ring-blue-500' : ''}`}
                      title={`${MONTH_NAMES[m - 1]} ${year}: שולם ₪${cell.paid} מתוך ₪${cell.expected}`}
                    >
                      <div className="font-medium">{MONTH_NAMES[m - 1].slice(0, 3)}</div>
                      <div dir="ltr">₪{cell.paid}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {cellPayments && selectedCell && (
        <div className="mt-4 p-3 bg-blue-50 rounded border border-blue-200">
          <h4 className="text-sm font-bold mb-2">
            {MONTH_NAMES[selectedCell.month - 1]} {selectedCell.year} —
            צפוי: <span dir="ltr">₪{cellPayments.expected}</span>,
            שולם: <span dir="ltr">₪{cellPayments.paid}</span>
          </h4>
          {cellPayments.payments.length === 0 ? (
            <div className="text-sm text-gray-400">אין תשלומים</div>
          ) : (
            <div className="space-y-1">
              {cellPayments.payments.map((p: any) => (
                <div key={p.id} className="text-sm flex gap-3">
                  <span dir="ltr">₪{p.amount}</span>
                  <span>{p.paid_date}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${p.source === 'csv' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                    {p.source === 'csv' ? 'CSV' : 'ידני'}
                  </span>
                  {p.notes && <span className="text-gray-400">{p.notes}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 inline-block"></span> שולם</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block"></span> חלקי</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-200 inline-block"></span> לא שולם</span>
      </div>

      {special_payments && special_payments.length > 0 && (
        <div className="mt-6 p-3 bg-purple-50 rounded border border-purple-200">
          <h3 className="text-sm font-bold mb-2">גבייה מיוחדת</h3>
          <div className="space-y-1">
            {special_payments.map((sp: any) => (
              <div key={sp.id} className="text-sm flex gap-3 items-center">
                <span dir="ltr">₪{sp.amount}</span>
                <span>{sp.paid_date}</span>
                <span className={`text-xs px-2 py-0.5 rounded ${sp.fund_name ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                  {sp.fund_name || 'אחר'}
                </span>
                {sp.notes && <span className="text-gray-400">{sp.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
