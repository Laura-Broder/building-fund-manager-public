import { useState, useEffect, useCallback, useMemo } from 'react'
import { getExpenses, createExpense, updateExpense, updateExpenseCategory, deleteExpense, approveExpense, getCategories, bulkDeleteExpenses, bulkApproveExpenses } from '../api'
import { useSelection } from '../hooks/useSelection'
import { useSort } from '../hooks/useSort'
import { useTextFilter } from '../hooks/useTextFilter'
import { useModal } from '../context/ModalContext'
import BulkActionBar from '../components/BulkActionBar'
import SortHeader from '../components/SortHeader'

export default function Expenses() {
  const now = new Date()
  const [expenses, setExpenses] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const { showAlert, showConfirm } = useModal()
  const [filterCategory, setFilterCategory] = useState('')
  const [filterPending, setFilterPending] = useState(false)
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const [form, setForm] = useState({
    amount: '',
    category: 'אחר',
    description: '',
    date: now.toISOString().split('T')[0],
    vendor: '',
  })

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filterCategory) params.category = filterCategory
    if (filterPending) params.status = 'pending_review'
    if (filterFrom) params.from = filterFrom
    if (filterTo) params.to = filterTo
    getExpenses(params).then(setExpenses).finally(() => setLoading(false))
  }, [filterCategory, filterPending, filterFrom, filterTo, setLoading, setExpenses])

  useEffect(() => {
    getCategories().then(cats => setCategories(cats.map((c: any) => c.name)))
  }, [])

  useEffect(() => { load() }, [load])

  const defaultForm = () => ({
    amount: '', category: 'אחר', description: '',
    date: new Date().toISOString().split('T')[0], vendor: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = { ...form, amount: Number(form.amount) }
      if (editingId) {
        await updateExpense(editingId, payload)
      } else {
        await createExpense(payload)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(defaultForm())
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בשמירה')
    }
  }

  const handleEdit = (exp: any) => {
    setEditingId(exp.id)
    setForm({
      amount: String(exp.amount),
      category: exp.category,
      description: exp.description || '',
      date: exp.date,
      vendor: exp.vendor || '',
    })
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(defaultForm())
  }

  const handleDelete = async (id: number) => {
    if (!await showConfirm('למחוק הוצאה זו?')) return
    try {
      await deleteExpense(id)
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleApprove = async (id: number) => {
    try {
      await approveExpense(id)
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה באישור')
    }
  }

  const selection = useSelection(expenses)

  const handleBulkDelete = async () => {
    if (!await showConfirm(`למחוק ${selection.count} הוצאות?`)) return
    try {
      await bulkDeleteExpenses(selection.selectedArray)
      selection.clear()
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleBulkApprove = async () => {
    try {
      await bulkApproveExpenses(selection.selectedArray)
      selection.clear()
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה באישור')
    }
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (filterCategory) params.set('category', filterCategory)
    if (filterFrom) params.set('from', filterFrom)
    if (filterTo) params.set('to', filterTo)
    if (filterPending) params.set('status', 'pending_review')
    window.location.href = `/api/expenses/export?${params.toString()}`
  }

  const searchFields = useMemo(() => ['description', 'vendor', 'category'] as const, [])
  const { searchText, setSearchText, filteredItems: searchedExpenses } = useTextFilter(expenses, searchFields as unknown as string[])

  const { sortedItems: sortedExpenses, sortKey, sortDir, requestSort } = useSort(searchedExpenses, 'date', 'desc')

  const hasPendingSelected = expenses.some(e => selection.isSelected(e.id) && e.status === 'pending_review')

  const totalAmount = searchedExpenses.reduce((sum, e) => sum + e.amount, 0)

  const byCategory: Record<string, number> = {}
  for (const exp of searchedExpenses) {
    byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">הוצאות</h1>
        <button
          onClick={() => showForm ? handleCancelForm() : setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'ביטול' : 'הוספת הוצאה'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-bold mb-3">{editingId ? 'עריכת הוצאה' : 'הוצאה חדשה'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <label className="block text-sm font-medium mb-1">קטגוריה *</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                {categories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תאריך *</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full border rounded px-3 py-2"
                dir="ltr"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">תיאור</label>
              <input
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">ספק / מי קיבל</label>
              <input
                value={form.vendor}
                onChange={e => setForm({ ...form, vendor: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            {editingId ? 'עדכון' : 'שמירה'}
          </button>
        </form>
      )}

      {/* Filter + Summary */}
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">כל הקטגוריות</option>
          {categories.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-500">מתאריך</label>
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="border rounded px-2 py-2 text-sm"
            dir="ltr"
          />
        </div>
        <div className="flex items-center gap-1">
          <label className="text-sm text-gray-500">עד</label>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="border rounded px-2 py-2 text-sm"
            dir="ltr"
          />
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
        <span className="text-gray-500">
          סה״כ: <strong dir="ltr">₪{totalAmount.toLocaleString()}</strong>
        </span>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(byCategory).map(([cat, amount]) => (
            <span key={cat} className="bg-gray-100 px-3 py-1 rounded text-sm">
              {cat}: <strong dir="ltr">₪{amount.toLocaleString()}</strong>
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : expenses.length === 0 ? (
        <div className="text-center py-10 text-gray-400">אין הוצאות להצגה</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="תאריך" sortKey="date" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="קטגוריה" sortKey="category" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="תיאור" sortKey="description" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="ספק" sortKey="vendor" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="סכום" sortKey="amount" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <th className="px-4 py-3 text-right">מקור</th>
                <th className="px-4 py-3 text-right">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenses.map((exp: any) => (
                <tr key={exp.id} className={`border-t hover:bg-gray-50 ${selection.isSelected(exp.id) ? 'bg-blue-50' : exp.status === 'pending_review' ? 'bg-yellow-50' : ''}`}>
                  <td className="px-4 py-3">{exp.date}</td>
                  <td className="px-4 py-3">
                    <select
                      value={exp.category}
                      onChange={async (e) => {
                        await updateExpenseCategory(exp.id, { category: e.target.value })
                        load()
                      }}
                      className="border rounded px-2 py-1 text-sm bg-transparent hover:bg-white cursor-pointer"
                    >
                      {categories.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">{exp.description}</td>
                  <td className="px-4 py-3">{exp.vendor}</td>
                  <td className="px-4 py-3" dir="ltr">₪{exp.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 items-center">
                      <span className={`text-xs px-2 py-1 rounded ${
                        exp.source === 'csv' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {exp.source === 'csv' ? 'CSV' : 'ידני'}
                      </span>
                      {exp.status === 'pending_review' && (
                        <span className="text-xs px-2 py-1 rounded bg-yellow-200 text-yellow-800">לבדיקה</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(exp)}
                        className="text-blue-600 hover:underline"
                      >
                        עריכה
                      </button>
                      {exp.status === 'pending_review' && (
                        <button
                          onClick={() => handleApprove(exp.id)}
                          className="text-green-600 hover:underline"
                        >
                          אישור
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(exp.id)}
                        className="text-red-600 hover:underline"
                      >
                        מחיקה
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selection.isSelected(exp.id)} onChange={() => selection.toggle(exp.id)} />
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
