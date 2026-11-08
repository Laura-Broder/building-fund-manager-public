import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  getSpecialPayments, createSpecialPayment, updateSpecialPayment, deleteSpecialPayment, bulkDeleteSpecialPayments,
  getSpecialFunds, createSpecialFund, deleteSpecialFund,
  getApartments,
} from '../api'
import { useSelection } from '../hooks/useSelection'
import { useSort } from '../hooks/useSort'
import { useTextFilter } from '../hooks/useTextFilter'
import { useModal } from '../context/ModalContext'
import BulkActionBar from '../components/BulkActionBar'
import SortHeader from '../components/SortHeader'

export default function SpecialPayments() {
  const [payments, setPayments] = useState<any[]>([])
  const [funds, setFunds] = useState<any[]>([])
  const [apartments, setApartments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const { showAlert, showConfirm } = useModal()

  const [filterFund, setFilterFund] = useState('')
  const [filterApartment, setFilterApartment] = useState('')

  const [newFundName, setNewFundName] = useState('')

  const defaultForm = () => ({
    apartment_id: '',
    fund_id: '',
    amount: '',
    paid_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [form, setForm] = useState(defaultForm())

  const loadPayments = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (filterFund) params.fund_id = filterFund
    if (filterApartment) params.apartment_id = filterApartment
    getSpecialPayments(params).then(setPayments).finally(() => setLoading(false))
  }, [filterFund, filterApartment])

  const loadFunds = () => { getSpecialFunds().then(setFunds) }

  useEffect(() => { loadPayments() }, [loadPayments])
  useEffect(() => { loadFunds() }, [])
  useEffect(() => { getApartments().then(setApartments) }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const data = {
        apartment_id: Number(form.apartment_id),
        fund_id: form.fund_id ? Number(form.fund_id) : null,
        amount: Number(form.amount),
        paid_date: form.paid_date,
        notes: form.notes,
      }
      if (editingId) {
        await updateSpecialPayment(editingId, data)
      } else {
        await createSpecialPayment(data)
      }
      setShowForm(false)
      setEditingId(null)
      setForm(defaultForm())
      loadPayments()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בשמירה')
    }
  }

  const handleEdit = (p: any) => {
    setEditingId(p.id)
    setForm({
      apartment_id: String(p.apartment_id),
      fund_id: p.fund_id ? String(p.fund_id) : '',
      amount: String(p.amount),
      paid_date: p.paid_date,
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
      await deleteSpecialPayment(id)
      loadPayments()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleAddFund = async () => {
    if (!newFundName.trim()) return
    try {
      await createSpecialFund({ name: newFundName.trim() })
      setNewFundName('')
      loadFunds()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בהוספת קרן')
    }
  }

  const handleDeleteFund = async (id: number) => {
    if (!await showConfirm('למחוק קרן זו? התשלומים ישמרו ללא שיוך לקרן.')) return
    try {
      await deleteSpecialFund(id)
      loadFunds()
      loadPayments()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקת קרן')
    }
  }

  const selection = useSelection(payments)

  const handleBulkDelete = async () => {
    if (!await showConfirm(`למחוק ${selection.count} תשלומים?`)) return
    try {
      await bulkDeleteSpecialPayments(selection.selectedArray)
      selection.clear()
      loadPayments()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleExport = () => {
    const params = new URLSearchParams()
    if (filterFund) params.set('fund_id', filterFund)
    if (filterApartment) params.set('apartment_id', filterApartment)
    window.location.href = `/api/special-payments/export?${params.toString()}`
  }

  const searchFields = useMemo(() => ['owner_name', 'apartment_number', 'fund_name', 'notes'] as const, [])
  const { searchText, setSearchText, filteredItems: searchedPayments } = useTextFilter(payments, searchFields as unknown as string[])
  const { sortedItems: sortedPayments, sortKey, sortDir, requestSort } = useSort(searchedPayments, 'paid_date', 'desc')

  const totalAmount = payments.reduce((sum: number, p: any) => sum + p.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">גבייה מיוחדת</h1>
        <button
          onClick={() => showForm ? handleCancelForm() : setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'ביטול' : 'הוספת תשלום'}
        </button>
      </div>

      {/* Fund management */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-sm font-bold mb-3">קרנות</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {funds.length === 0 && <span className="text-sm text-gray-400">אין קרנות מוגדרות</span>}
          {funds.map((f: any) => (
            <span key={f.id} className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
              {f.name}
              <button
                onClick={() => handleDeleteFund(f.id)}
                className="text-blue-400 hover:text-red-500 mr-1"
                title="מחיקת קרן"
              >&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newFundName}
            onChange={e => setNewFundName(e.target.value)}
            placeholder="שם קרן חדשה..."
            className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddFund() } }}
          />
          <button
            onClick={handleAddFund}
            className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
          >
            הוספה
          </button>
        </div>
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
              <label className="block text-sm font-medium mb-1">קרן</label>
              <select
                value={form.fund_id}
                onChange={e => setForm({ ...form, fund_id: e.target.value })}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">אחר</option>
                {funds.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
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
            <div className="md:col-span-2">
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
          value={filterFund}
          onChange={e => setFilterFund(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">כל הקרנות</option>
          <option value="none">אחר (ללא קרן)</option>
          {funds.map((f: any) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <select
          value={filterApartment}
          onChange={e => setFilterApartment(e.target.value)}
          className="border rounded px-3 py-2"
        >
          <option value="">כל הדירות</option>
          {apartments.map((apt: any) => (
            <option key={apt.id} value={apt.id}>דירה {apt.number}</option>
          ))}
        </select>
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="חיפוש..."
          className="border rounded px-3 py-2 text-sm"
        />
        <button
          onClick={handleExport}
          className="border border-gray-300 text-gray-600 hover:bg-gray-50 px-3 py-2 rounded text-sm"
        >
          ייצוא CSV
        </button>
        {payments.length > 0 && (
          <span className="text-sm text-gray-500 self-center">
            סה״כ: <span dir="ltr">₪{totalAmount.toLocaleString()}</span> ({payments.length} תשלומים)
          </span>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-10 text-gray-400">אין תשלומים מיוחדים להצגה</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="דירה" sortKey="apartment_number" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="שם" sortKey="owner_name" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="קרן" sortKey="fund_name" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="סכום" sortKey="amount" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="תאריך" sortKey="paid_date" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <th className="px-4 py-3 text-right">הערות</th>
                <th className="px-4 py-3 text-right">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPayments.map((p: any) => (
                <tr key={p.id} className={`border-t hover:bg-gray-50 ${selection.isSelected(p.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 font-bold">{p.apartment_number}</td>
                  <td className="px-4 py-3">{p.owner_name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded ${p.fund_name ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {p.fund_name || 'אחר'}
                    </span>
                  </td>
                  <td className="px-4 py-3" dir="ltr">₪{p.amount.toLocaleString()}</td>
                  <td className="px-4 py-3">{p.paid_date}</td>
                  <td className="px-4 py-3 text-gray-500 text-sm">{p.notes}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => handleEdit(p)} className="text-blue-600 hover:underline">עריכה</button>
                      <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">מחיקה</button>
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
          { label: 'מחיקת נבחרים', onClick: handleBulkDelete, className: 'bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700' },
        ]}
      />
    </div>
  )
}
