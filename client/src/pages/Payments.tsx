import { useState, useEffect, useCallback, useMemo } from 'react'
import { getPayments, createPayment, updatePayment, deletePayment, approvePayment, getApartments, bulkDeletePayments, bulkApprovePayments } from '../api'
import { useSelection } from '../hooks/useSelection'
import { useSort } from '../hooks/useSort'
import { useTextFilter } from '../hooks/useTextFilter'
import { useModal } from '../context/ModalContext'
import BulkActionBar from '../components/BulkActionBar'
import SortHeader from '../components/SortHeader'

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

export default function Payments() {
  const now = new Date()
  const [payments, setPayments] = useState<any[]>([])
  const [apartments, setApartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const { showAlert, showConfirm } = useModal()
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState(String(now.getFullYear()))
  const [filterPending, setFilterPending] = useState(false)

  const [form, setForm] = useState({
    apartment_id: '',
    amount: '',
    paid_date: now.toISOString().split('T')[0],
    from_month: String(now.getMonth() + 1),
    to_month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
    notes: '',
  })

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filterMonth) params.month = filterMonth
    if (filterYear) params.year = filterYear
    if (filterPending) params.status = 'pending_review'
    getPayments(params).then(setPayments).finally(() => setLoading(false))
  }, [filterMonth, filterYear, filterPending, setLoading, setPayments])

  useEffect(() => { load() }, [load])
  useEffect(() => { getApartments().then(setApartments) }, [])

  const defaultForm = () => ({
    apartment_id: '', amount: '',
    paid_date: new Date().toISOString().split('T')[0],
    from_month: String(new Date().getMonth() + 1),
    to_month: String(new Date().getMonth() + 1),
    year: String(new Date().getFullYear()), notes: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingId) {
        await updatePayment(editingId, {
          apartment_id: Number(form.apartment_id),
          amount: Number(form.amount),
          paid_date: form.paid_date,
          for_month: Number(form.from_month),
          for_year: Number(form.year),
          notes: form.notes,
        })
      } else {
        const fromM = Number(form.from_month)
        const toM = Number(form.to_month)
        if (fromM > toM) {
          await showAlert('חודש התחלה חייב להיות לפני חודש סיום')
          return
        }
        const months = []
        for (let m = fromM; m <= toM; m++) {
          months.push({ month: m, year: Number(form.year) })
        }
        await createPayment({
          apartment_id: Number(form.apartment_id),
          amount: Number(form.amount),
          paid_date: form.paid_date,
          months,
          notes: form.notes,
        })
      }
      setShowForm(false)
      setEditingId(null)
      setForm(defaultForm())
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בשמירה')
    }
  }

  const handleEdit = (p: any) => {
    setEditingId(p.id)
    setForm({
      apartment_id: String(p.apartment_id),
      amount: String(p.amount),
      paid_date: p.paid_date,
      from_month: String(p.for_month),
      to_month: String(p.for_month),
      year: String(p.for_year),
      notes: p.notes || '',
    })
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(defaultForm())
  }

  const handleDelete = async (id: number) => {
    if (!await showConfirm('למחוק תשלום זה?')) return
    try {
      await deletePayment(id)
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleApprove = async (id: number) => {
    try {
      await approvePayment(id)
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה באישור')
    }
  }

  const selection = useSelection(payments)

  const handleBulkDelete = async () => {
    if (!await showConfirm(`למחוק ${selection.count} תשלומים?`)) return
    try {
      await bulkDeletePayments(selection.selectedArray)
      selection.clear()
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleBulkApprove = async () => {
    try {
      await bulkApprovePayments(selection.selectedArray)
      selection.clear()
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה באישור')
    }
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (filterMonth) params.set('month', filterMonth)
    if (filterYear) params.set('year', filterYear)
    if (filterPending) params.set('status', 'pending_review')
    window.location.href = `/api/payments/export?${params.toString()}`
  }

  const searchFields = useMemo(() => ['owner_name', 'apartment_number', 'notes'] as const, [])
  const { searchText, setSearchText, filteredItems: searchedPayments } = useTextFilter(payments, searchFields as unknown as string[])

  const sortGetters = useMemo(() => ({
    for_month: (p: any) => p.for_year * 100 + p.for_month,
  }), [])
  const { sortedItems: sortedPayments, sortKey, sortDir, requestSort } = useSort(searchedPayments, 'paid_date', 'desc', sortGetters)

  const hasPendingSelected = payments.some(p => selection.isSelected(p.id) && p.status === 'pending_review')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">תשלומים</h1>
        <button
          onClick={() => showForm ? handleCancelForm() : setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'ביטול' : 'הוספת תשלום'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-bold mb-3">{editingId ? 'עריכת תשלום' : 'תשלום חדש'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">דירה *</label>
              <select
                value={form.apartment_id}
                onChange={e => setForm({ ...form, apartment_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">בחר דירה</option>
                {apartments.map((apt: any) => (
                  <option key={apt.id} value={apt.id}>
                    דירה {apt.number} - {apt.owner_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">סכום *</label>
              <input
                type="number"
                value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })}
                className="w-full border rounded px-3 py-2"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תאריך תשלום *</label>
              <input
                type="date"
                value={form.paid_date}
                onChange={e => setForm({ ...form, paid_date: e.target.value })}
                className="w-full border rounded px-3 py-2"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{editingId ? 'חודש' : 'מחודש'}</label>
              <select
                value={form.from_month}
                onChange={e => setForm({ ...form, from_month: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            {!editingId && (
              <div>
                <label className="block text-sm font-medium mb-1">עד חודש</label>
                <select
                  value={form.to_month}
                  onChange={e => setForm({ ...form, to_month: e.target.value })}
                  className="w-full border rounded px-3 py-2"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">שנה</label>
              <input
                type="number"
                value={form.year}
                onChange={e => setForm({ ...form, year: e.target.value })}
                className="w-full border rounded px-3 py-2"
                dir="ltr"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium mb-1">הערות</label>
              <input
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            {editingId ? 'עדכון' : 'שמירה'}
          </button>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">כל החודשים</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={filterYear}
            onChange={e => setFilterYear(e.target.value)}
            placeholder="כל השנים"
            className="border rounded px-3 py-2 w-24"
            dir="ltr"
          />
          {filterYear && (
            <button
              onClick={() => setFilterYear('')}
              className="text-gray-400 hover:text-gray-600 text-sm px-1"
              title="הצג כל השנים"
            >×</button>
          )}
        </div>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="חיפוש..."
          className="border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={() => setFilterPending(!filterPending)}
          className={`px-3 py-2 rounded text-sm ${
            filterPending ? 'bg-yellow-200 text-yellow-800 border border-yellow-400' : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          {filterPending ? 'הצג הכל' : 'לבדיקה בלבד'}
        </button>
        <button
          onClick={handleExport}
          className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded text-sm"
        >
          ייצוא CSV
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10 text-gray-400">אין תשלומים להצגה</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="דירה" sortKey="apartment_number" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="שם" sortKey="owner_name" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="סכום" sortKey="amount" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="תאריך" sortKey="paid_date" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="עבור חודש" sortKey="for_month" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <th className="px-4 py-3 text-right">מקור</th>
                <th className="px-4 py-3 text-right">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPayments.map((p: any) => (
                <tr key={p.id} className={`border-t hover:bg-gray-50 ${selection.isSelected(p.id) ? 'bg-blue-50' : p.status === 'pending_review' ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3 font-bold">{p.apartment_number}</td>
                  <td className="px-4 py-3">{p.owner_name}</td>
                  <td className="px-4 py-3" dir="ltr">₪{p.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.paid_date}</td>
                  <td className="px-4 py-3">{MONTHS[p.for_month - 1]} {p.for_year}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 items-center">
                      <span className={`text-xs px-2 py-1 rounded ${
                        p.source === 'csv' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {p.source === 'csv' ? 'CSV' : 'ידני'}
                      </span>
                      {p.status === 'pending_review' && (
                        <span className="text-xs px-2 py-1 rounded bg-yellow-200 text-yellow-800">לבדיקה</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(p)}
                        className="text-blue-600 hover:underline"
                      >
                        עריכה
                      </button>
                      {p.status === 'pending_review' && (
                        <button
                          onClick={() => handleApprove(p.id)}
                          className="text-green-600 hover:underline"
                        >
                          אישור
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-red-600 hover:underline"
                      >
                        מחיקה
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selection.isSelected(p.id)} onChange={() => selection.toggle(p.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BulkActionBar
        count={selection.count}
        onClear={selection.clear}
        actions={[
          { label: 'אישור נבחרים', onClick: handleBulkApprove, show: hasPendingSelected, className: 'bg-green-600 text-white px-4 py-1.5 rounded hover:bg-green-700' },
          { label: 'מחיקת נבחרים', onClick: handleBulkDelete, className: 'bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700' },
        ]}
      />
    </div>
  )
}
