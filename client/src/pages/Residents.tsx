import React, { useState, useEffect, useMemo } from 'react'
import { getApartments, createApartment, updateApartment, deleteApartment, bulkDeleteApartments, getOwnershipHistory, changeOwner, updateOwnershipHistory, deleteOwnershipHistory } from '../api'
import { useSelection } from '../hooks/useSelection'
import { useSort } from '../hooks/useSort'
import { useTextFilter } from '../hooks/useTextFilter'
import { useModal } from '../context/ModalContext'
import BulkActionBar from '../components/BulkActionBar'
import SortHeader from '../components/SortHeader'
import ApartmentHistory from '../components/ApartmentHistory'

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

interface Apartment {
  id: number
  number: string
  owner_name: string
}

export default function Residents() {
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Apartment | null>(null)
  const [form, setForm] = useState({ number: '', owner_name: '' })
  const [changeOwnerApt, setChangeOwnerApt] = useState<Apartment | null>(null)
  const [changeOwnerForm, setChangeOwnerForm] = useState({ new_owner_name: '', from_month: '', from_year: '' })
  const [historyApt, setHistoryApt] = useState<number | null>(null)
  const [ownerHistory, setOwnerHistory] = useState<any[]>([])
  const [fullHistoryApt, setFullHistoryApt] = useState<number | null>(null)
  const [editingHistoryId, setEditingHistoryId] = useState<number | null>(null)
  const [historyForm, setHistoryForm] = useState({ owner_name: '', from_month: '', from_year: '', to_month: '', to_year: '' })
  const { showAlert, showConfirm } = useModal()

  const load = () => {
    setLoading(true)
    getApartments().then(setApartments).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const resetForm = () => {
    setForm({ number: '', owner_name: '' })
    setEditing(null)
    setShowForm(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing) {
        await updateApartment(editing.id, form)
      } else {
        await createApartment(form)
      }
      resetForm()
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בשמירה')
    }
  }

  const handleEdit = (apt: Apartment) => {
    setForm({ number: apt.number, owner_name: apt.owner_name })
    setEditing(apt)
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    if (!await showConfirm('למחוק דירה זו? כל התשלומים המשויכים יימחקו גם.')) return
    try {
      await deleteApartment(id)
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const handleChangeOwner = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!changeOwnerApt) return
    try {
      await changeOwner(changeOwnerApt.id, {
        new_owner_name: changeOwnerForm.new_owner_name,
        from_month: Number(changeOwnerForm.from_month),
        from_year: Number(changeOwnerForm.from_year),
      })
      setChangeOwnerApt(null)
      setChangeOwnerForm({ new_owner_name: '', from_month: '', from_year: '' })
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בהחלפת דייר')
    }
  }

  const toggleHistory = async (aptId: number) => {
    if (historyApt === aptId) {
      setHistoryApt(null)
      setOwnerHistory([])
    } else {
      const history = await getOwnershipHistory(aptId)
      setOwnerHistory(history)
      setHistoryApt(aptId)
    }
  }

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

  const handleSaveHistory = async (aptId: number, historyId: number) => {
    try {
      await updateOwnershipHistory(aptId, historyId, {
        owner_name: historyForm.owner_name,
        from_month: Number(historyForm.from_month),
        from_year: Number(historyForm.from_year),
        to_month: historyForm.to_month ? Number(historyForm.to_month) : null,
        to_year: historyForm.to_year ? Number(historyForm.to_year) : null,
      })
      setEditingHistoryId(null)
      const history = await getOwnershipHistory(aptId)
      setOwnerHistory(history)
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה בעדכון')
    }
  }

  const handleDeleteHistory = async (aptId: number, historyId: number) => {
    if (!await showConfirm('למחוק רשומת דייר קודם זו?')) return
    try {
      await deleteOwnershipHistory(aptId, historyId)
      const history = await getOwnershipHistory(aptId)
      setOwnerHistory(history)
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  const searchFields = useMemo(() => ['owner_name', 'number'] as const, [])
  const { searchText, setSearchText, filteredItems: searchedApartments } = useTextFilter(apartments, searchFields as unknown as string[])

  const selection = useSelection(apartments)
  const { sortedItems: sortedApartments, sortKey, sortDir, requestSort } = useSort(searchedApartments, 'number')

  const handleBulkDelete = async () => {
    if (!await showConfirm(`למחוק ${selection.count} דירות? כל התשלומים המשויכים יימחקו גם.`)) return
    try {
      await bulkDeleteApartments(selection.selectedArray)
      selection.clear()
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה במחיקה')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">דיירים</h1>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm) }}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          {showForm ? 'ביטול' : 'הוספת דירה'}
        </button>
      </div>

      {changeOwnerApt && (
        <form onSubmit={handleChangeOwner} className="bg-yellow-50 border border-yellow-200 rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-bold mb-3">החלפת דייר — דירה {changeOwnerApt.number} (כרגע: {changeOwnerApt.owner_name})</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">שם דייר חדש *</label>
              <input
                value={changeOwnerForm.new_owner_name}
                onChange={e => setChangeOwnerForm({ ...changeOwnerForm, new_owner_name: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">מחודש *</label>
              <select
                value={changeOwnerForm.from_month}
                onChange={e => setChangeOwnerForm({ ...changeOwnerForm, from_month: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              >
                <option value="">חודש</option>
                {MONTH_NAMES.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שנה *</label>
              <input
                type="number"
                value={changeOwnerForm.from_year}
                onChange={e => setChangeOwnerForm({ ...changeOwnerForm, from_year: e.target.value })}
                className="w-full border rounded px-3 py-2"
                dir="ltr"
                required
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button type="submit" className="bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700">
              החלף דייר
            </button>
            <button type="button" onClick={() => setChangeOwnerApt(null)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300">
              ביטול
            </button>
          </div>
        </form>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-4 mb-6">
          <h2 className="text-lg font-bold mb-3">{editing ? 'עריכת דירה' : 'דירה חדשה'}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">מספר דירה *</label>
              <input
                value={form.number}
                onChange={e => setForm({ ...form, number: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">שם בעלים *</label>
              <input
                value={form.owner_name}
                onChange={e => setForm({ ...form, owner_name: e.target.value })}
                className="w-full border rounded px-3 py-2"
                required
              />
            </div>
          </div>
          <button type="submit" className="mt-4 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700">
            {editing ? 'עדכון' : 'הוספה'}
          </button>
        </form>
      )}

      {fullHistoryApt && (
        <div className="mb-6">
          <ApartmentHistory apartmentId={fullHistoryApt} onClose={() => setFullHistoryApt(null)} />
        </div>
      )}

      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          placeholder="חיפוש..."
          className="border rounded px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : apartments.length === 0 ? (
        <div className="text-center py-10 text-gray-400">אין דירות עדיין. הוסיפו דירה ראשונה.</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="מס׳ דירה" sortKey="number" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <SortHeader label="שם" sortKey="owner_name" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right" />
                <th className="px-4 py-3 text-right">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedApartments.map(apt => (
              <React.Fragment key={apt.id}>
                <tr className={`border-t hover:bg-gray-50 ${selection.isSelected(apt.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 font-bold">{apt.number}</td>
                  <td className="px-4 py-3">{apt.owner_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => handleEdit(apt)}
                        className="text-blue-600 hover:underline"
                      >
                        עריכה
                      </button>
                      <button
                        onClick={() => { setChangeOwnerApt(apt); setShowForm(false) }}
                        className="text-yellow-600 hover:underline"
                      >
                        החלפת דייר
                      </button>
                      <button
                        onClick={() => setFullHistoryApt(apt.id)}
                        className="text-indigo-600 hover:underline"
                      >
                        היסטוריית תשלומים
                      </button>
                      <button
                        onClick={() => toggleHistory(apt.id)}
                        className="text-gray-500 hover:underline"
                      >
                        {historyApt === apt.id ? 'הסתר דיירים' : 'דיירים'}
                      </button>
                      <button
                        onClick={() => handleDelete(apt.id)}
                        className="text-red-600 hover:underline"
                      >
                        מחיקה
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selection.isSelected(apt.id)} onChange={() => selection.toggle(apt.id)} />
                  </td>
                </tr>
                {historyApt === apt.id && ownerHistory.length > 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan={4} className="px-4 py-3">
                      <div className="text-sm font-medium mb-2">דיירים קודמים:</div>
                      <div className="space-y-2">
                        {ownerHistory.map((h: any) => (
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
                                  onClick={() => handleSaveHistory(apt.id, h.id)}
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
                                onClick={() => handleDeleteHistory(apt.id, h.id)}
                                className="text-red-500 hover:underline text-xs"
                              >
                                מחיקה
                              </button>
                            </div>
                          )
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                {historyApt === apt.id && ownerHistory.length === 0 && (
                  <tr className="bg-gray-50">
                    <td colSpan={4} className="px-4 py-3 text-sm text-gray-400">אין היסטוריית דיירים</td>
                  </tr>
                )}
              </React.Fragment>
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
