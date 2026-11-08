import { useState, useEffect } from 'react'
import { getSettings, updateSettings, getAliases, deleteAlias, getExpenseAliases, deleteExpenseAlias, getCategories, createCategory, deleteCategory, bulkDeleteAliases, bulkDeleteExpenseAliases, resetData, getFeeHistory, createFeeHistory, deleteFeeHistory, getCategoryKeywords, createCategoryKeyword, deleteCategoryKeyword, getRecurringExpenses, createRecurringExpense, deleteRecurringExpense } from '../api'
import { useSelection } from '../hooks/useSelection'
import { useSort } from '../hooks/useSort'
import { useModal } from '../context/ModalContext'
import BulkActionBar from '../components/BulkActionBar'
import SortHeader from '../components/SortHeader'

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

const RESET_OPTIONS: { key: string; label: string; note?: string }[] = [
  { key: 'apartments', label: 'דירות', note: 'כולל תשלומים ושיוכי שמות של הדירות' },
  { key: 'payments', label: 'תשלומים' },
  { key: 'expenses', label: 'הוצאות' },
  { key: 'name_aliases', label: 'שיוכי שמות' },
  { key: 'expense_category_aliases', label: 'שיוכי קטגוריות הוצאה' },
  { key: 'expense_categories', label: 'קטגוריות הוצאה', note: 'כולל שיוכי קטגוריות. קטגוריות ברירת מחדל ישוחזרו' },
  { key: 'fee_history', label: 'היסטוריית דמי ועד' },
  { key: 'category_keywords', label: 'מילות מפתח לקטגוריות' },
  { key: 'recurring_expenses', label: 'הוצאות חוזרות' },
  { key: 'uploaded_files', label: 'קבצים שהועלו', note: 'הקבצים יימחקו מהשרת' },
  { key: 'settings', label: 'הגדרות', note: 'ערכי ברירת מחדל ישוחזרו' },
]

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [aliases, setAliases] = useState<any[]>([])
  const [expenseAliases, setExpenseAliases] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [newCategory, setNewCategory] = useState('')
  const [feeHistory, setFeeHistory] = useState<any[]>([])
  const [newFee, setNewFee] = useState({ amount: '', month: '', year: '' })
  const [keywords, setKeywords] = useState<any[]>([])
  const [newKeyword, setNewKeyword] = useState({ keyword: '', category: '' })
  const [recurring, setRecurring] = useState<any[]>([])
  const [newRecurring, setNewRecurring] = useState({ description: '', category: '', expected_amount: '', vendor: '' })
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [resetEntities, setResetEntities] = useState<Set<string>>(new Set())
  const [resetting, setResetting] = useState(false)
  const { showAlert, showConfirm } = useModal()

  const load = () => {
    setLoading(true)
    Promise.all([getSettings(), getAliases(), getExpenseAliases(), getCategories(), getFeeHistory(), getCategoryKeywords(), getRecurringExpenses()])
      .then(([s, a, ea, cats, fh, kw, re]) => { setSettings(s); setAliases(a); setExpenseAliases(ea); setCategories(cats); setFeeHistory(fh); setKeywords(kw); setRecurring(re) })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    await updateSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDeleteAlias = async (id: number) => {
    if (!await showConfirm('למחוק שיוך שם זה?')) return
    await deleteAlias(id)
    load()
  }

  const handleDeleteExpenseAlias = async (id: number) => {
    if (!await showConfirm('למחוק שיוך קטגוריה זה?')) return
    await deleteExpenseAlias(id)
    load()
  }

  const aliasSelection = useSelection(aliases)
  const expenseAliasSelection = useSelection(expenseAliases)
  const { sortedItems: sortedAliases, sortKey: aliasSortKey, sortDir: aliasSortDir, requestSort: requestAliasSort } = useSort(aliases, 'alias')
  const { sortedItems: sortedExpenseAliases, sortKey: eaSortKey, sortDir: eaSortDir, requestSort: requestEASort } = useSort(expenseAliases, 'alias')

  const handleBulkDeleteAliases = async () => {
    if (!await showConfirm(`למחוק ${aliasSelection.count} שיוכי שמות?`)) return
    await bulkDeleteAliases(aliasSelection.selectedArray)
    aliasSelection.clear()
    load()
  }

  const handleBulkDeleteExpenseAliases = async () => {
    if (!await showConfirm(`למחוק ${expenseAliasSelection.count} שיוכי קטגוריות?`)) return
    await bulkDeleteExpenseAliases(expenseAliasSelection.selectedArray)
    expenseAliasSelection.clear()
    load()
  }

  // Selecting in one table clears the other
  const toggleAlias = (id: number) => {
    expenseAliasSelection.clear()
    aliasSelection.toggle(id)
  }
  const toggleAllAliases = () => {
    expenseAliasSelection.clear()
    aliasSelection.toggleAll()
  }
  const toggleExpenseAlias = (id: number) => {
    aliasSelection.clear()
    expenseAliasSelection.toggle(id)
  }
  const toggleAllExpenseAliases = () => {
    aliasSelection.clear()
    expenseAliasSelection.toggleAll()
  }

  const toggleResetEntity = (key: string) => {
    setResetEntities(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const toggleAllResetEntities = () => {
    if (resetEntities.size === RESET_OPTIONS.length) {
      setResetEntities(new Set())
    } else {
      setResetEntities(new Set(RESET_OPTIONS.map(o => o.key)))
    }
  }

  const handleReset = async () => {
    if (resetEntities.size === 0) return
    const labels = RESET_OPTIONS.filter(o => resetEntities.has(o.key)).map(o => o.label)
    if (!await showConfirm(`פעולה זו תמחק לצמיתות את כל הנתונים עבור:\n${labels.join(', ')}\n\nלהמשיך?`)) return
    setResetting(true)
    try {
      await resetData(Array.from(resetEntities))
      setResetEntities(new Set())
      await showAlert('הנתונים אופסו בהצלחה')
      load()
    } catch (err: any) {
      await showAlert(err.message || 'שגיאה באיפוס הנתונים')
    } finally {
      setResetting(false)
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-500">טוען...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">הגדרות</h1>

      <form onSubmit={handleSave} className="bg-white rounded-lg shadow p-6 mb-8 max-w-lg">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">שם הבניין</label>
          <input
            value={settings.building_name || ''}
            onChange={e => setSettings({ ...settings, building_name: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">תאריך תחילת ניהול החשבון</label>
          <div className="flex gap-3">
            <select
              value={settings.account_start_month || ''}
              onChange={e => setSettings({ ...settings, account_start_month: e.target.value })}
              className="flex-1 border rounded px-3 py-2"
            >
              <option value="">חודש</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={String(i + 1)}>{name}</option>
              ))}
            </select>
            <select
              value={settings.account_start_year || ''}
              onChange={e => setSettings({ ...settings, account_start_year: e.target.value })}
              className="flex-1 border rounded px-3 py-2"
              dir="ltr"
            >
              <option value="">שנה</option>
              {Array.from({ length: new Date().getFullYear() - 2000 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
                <option key={y} value={String(y)}>{y}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">דמי ועד חודשיים (₪)</label>
          <input
            type="number"
            value={settings.monthly_fee || ''}
            onChange={e => setSettings({ ...settings, monthly_fee: e.target.value })}
            className="w-full border rounded px-3 py-2"
            dir="ltr"
          />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
          שמירה
        </button>
        {saved && <span className="text-green-600 mr-3">נשמר!</span>}
      </form>

      <h2 className="text-xl font-bold mb-3">היסטוריית דמי ועד</h2>
      <p className="text-sm text-gray-500 mb-3">
        תעריפי דמי ועד לאורך זמן. כל תעריף חל מהחודש שצוין ועד לתעריף הבא. התעריף הנוכחי (למעלה) מסונכרן אוטומטית עם הרשומה האחרונה.
      </p>
      <div className="bg-white rounded-lg shadow p-4 mb-8 max-w-lg">
        {feeHistory.length > 0 && (
          <table className="w-full mb-4">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right text-sm font-medium">מחודש</th>
                <th className="px-3 py-2 text-right text-sm font-medium">סכום (₪)</th>
                <th className="px-3 py-2 text-right text-sm font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {feeHistory.map((entry: any) => (
                <tr key={entry.id} className="border-t">
                  <td className="px-3 py-2 text-sm">{MONTH_NAMES[entry.effective_from_month - 1]} {entry.effective_from_year}</td>
                  <td className="px-3 py-2 text-sm" dir="ltr">{entry.amount} ₪</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={async () => {
                        if (!await showConfirm('למחוק תעריף זה?')) return
                        await deleteFeeHistory(entry.id)
                        load()
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {feeHistory.length === 0 && (
          <div className="text-gray-400 text-sm mb-4">אין היסטוריית דמי ועד</div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newFee.amount || !newFee.month || !newFee.year) return
            try {
              await createFeeHistory({
                amount: Number(newFee.amount),
                effective_from_month: Number(newFee.month),
                effective_from_year: Number(newFee.year),
              })
              setNewFee({ amount: '', month: '', year: '' })
              load()
            } catch (err: any) {
              await showAlert(err.message || 'שגיאה בהוספת תעריף')
            }
          }}
          className="flex gap-2 items-end"
        >
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">סכום (₪)</label>
            <input
              type="number"
              value={newFee.amount}
              onChange={e => setNewFee({ ...newFee, amount: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-sm"
              dir="ltr"
              placeholder="300"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">מחודש</label>
            <select
              value={newFee.month}
              onChange={e => setNewFee({ ...newFee, month: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">חודש</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">שנה</label>
            <input
              type="number"
              value={newFee.year}
              onChange={e => setNewFee({ ...newFee, year: e.target.value })}
              className="w-full border rounded px-2 py-1.5 text-sm"
              dir="ltr"
              placeholder={String(new Date().getFullYear())}
            />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700 text-sm whitespace-nowrap">
            הוסף תעריף
          </button>
        </form>
      </div>

      <h2 className="text-xl font-bold mb-3">קטגוריות הוצאה</h2>
      <p className="text-sm text-gray-500 mb-3">
        ניהול קטגוריות הוצאה. קטגוריות אלה מופיעות בטפסי הוצאות ובייבוא CSV.
      </p>
      <div className="bg-white rounded-lg shadow p-4 mb-8 max-w-lg">
        <div className="flex flex-wrap gap-2 mb-4">
          {categories.map((cat: any) => (
            <span key={cat.id} className="inline-flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded text-sm">
              {cat.name}
              <button
                onClick={async () => {
                  if (!await showConfirm(`למחוק את הקטגוריה "${cat.name}"?`)) return
                  await deleteCategory(cat.id)
                  load()
                }}
                className="text-red-400 hover:text-red-600 mr-1"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newCategory.trim()) return
            try {
              await createCategory(newCategory.trim())
              setNewCategory('')
              load()
            } catch (err: any) {
              await showAlert(err.message || 'שגיאה בהוספת קטגוריה')
            }
          }}
          className="flex gap-2"
        >
          <input
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            placeholder="קטגוריה חדשה"
            className="border rounded px-3 py-2 flex-1"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            הוסף
          </button>
        </form>
      </div>

      <h2 className="text-xl font-bold mb-3">מילות מפתח לקטגוריות הוצאה</h2>
      <p className="text-sm text-gray-500 mb-3">
        מילות מפתח לזיהוי אוטומטי של קטגוריות הוצאה בייבוא CSV. אם תיאור ההוצאה מכיל את מילת המפתח, הקטגוריה תוצע אוטומטית.
      </p>
      <div className="bg-white rounded-lg shadow p-4 mb-8 max-w-lg">
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {keywords.map((kw: any) => (
              <span key={kw.id} className="inline-flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded text-sm">
                <span className="font-mono">{kw.keyword}</span>
                <span className="text-gray-400">→</span>
                <span>{kw.category}</span>
                <button
                  onClick={async () => {
                    if (!await showConfirm(`למחוק מילת מפתח "${kw.keyword}"?`)) return
                    await deleteCategoryKeyword(kw.id)
                    load()
                  }}
                  className="text-red-400 hover:text-red-600 mr-1"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
        {keywords.length === 0 && (
          <div className="text-gray-400 text-sm mb-4">אין מילות מפתח</div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newKeyword.keyword.trim() || !newKeyword.category.trim()) return
            try {
              await createCategoryKeyword(newKeyword)
              setNewKeyword({ keyword: '', category: '' })
              load()
            } catch (err: any) {
              await showAlert(err.message || 'שגיאה בהוספת מילת מפתח')
            }
          }}
          className="flex gap-2"
        >
          <input
            value={newKeyword.keyword}
            onChange={e => setNewKeyword({ ...newKeyword, keyword: e.target.value })}
            placeholder="מילת מפתח"
            className="border rounded px-3 py-2 flex-1"
          />
          <select
            value={newKeyword.category}
            onChange={e => setNewKeyword({ ...newKeyword, category: e.target.value })}
            className="border rounded px-3 py-2"
          >
            <option value="">קטגוריה</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 whitespace-nowrap">
            הוסף
          </button>
        </form>
      </div>

      <h2 className="text-xl font-bold mb-3">הוצאות חוזרות</h2>
      <p className="text-sm text-gray-500 mb-3">
        הגדרת הוצאות צפויות חוזרות (ניקיון, חשמל וכו׳). המערכת תוכל להתריע כשהוצאה חוזרת חסרה.
      </p>
      <div className="bg-white rounded-lg shadow p-4 mb-8 max-w-2xl">
        {recurring.length > 0 && (
          <table className="w-full mb-4">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-right text-sm font-medium">תיאור</th>
                <th className="px-3 py-2 text-right text-sm font-medium">קטגוריה</th>
                <th className="px-3 py-2 text-right text-sm font-medium">סכום צפוי</th>
                <th className="px-3 py-2 text-right text-sm font-medium">ספק</th>
                <th className="px-3 py-2 text-right text-sm font-medium">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {recurring.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2 text-sm">{r.description}</td>
                  <td className="px-3 py-2 text-sm">{r.category}</td>
                  <td className="px-3 py-2 text-sm" dir="ltr">₪{r.expected_amount}</td>
                  <td className="px-3 py-2 text-sm">{r.vendor}</td>
                  <td className="px-3 py-2">
                    <button
                      onClick={async () => {
                        if (!await showConfirm(`למחוק הוצאה חוזרת "${r.description}"?`)) return
                        await deleteRecurringExpense(r.id)
                        load()
                      }}
                      className="text-red-600 hover:underline text-sm"
                    >
                      מחיקה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {recurring.length === 0 && (
          <div className="text-gray-400 text-sm mb-4">אין הוצאות חוזרות</div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newRecurring.description.trim() || !newRecurring.category.trim() || !newRecurring.expected_amount) return
            try {
              await createRecurringExpense({
                ...newRecurring,
                expected_amount: Number(newRecurring.expected_amount),
              })
              setNewRecurring({ description: '', category: '', expected_amount: '', vendor: '' })
              load()
            } catch (err: any) {
              await showAlert(err.message || 'שגיאה בהוספת הוצאה חוזרת')
            }
          }}
          className="flex gap-2 flex-wrap"
        >
          <input
            value={newRecurring.description}
            onChange={e => setNewRecurring({ ...newRecurring, description: e.target.value })}
            placeholder="תיאור"
            className="border rounded px-3 py-2 flex-1 min-w-[120px]"
          />
          <select
            value={newRecurring.category}
            onChange={e => setNewRecurring({ ...newRecurring, category: e.target.value })}
            className="border rounded px-3 py-2"
          >
            <option value="">קטגוריה</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <input
            type="number"
            value={newRecurring.expected_amount}
            onChange={e => setNewRecurring({ ...newRecurring, expected_amount: e.target.value })}
            placeholder="סכום צפוי"
            className="border rounded px-3 py-2 w-28"
            dir="ltr"
          />
          <input
            value={newRecurring.vendor}
            onChange={e => setNewRecurring({ ...newRecurring, vendor: e.target.value })}
            placeholder="ספק"
            className="border rounded px-3 py-2 w-28"
          />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 whitespace-nowrap">
            הוסף
          </button>
        </form>
      </div>

      <h2 className="text-xl font-bold mb-3">שיוכי שמות</h2>
      <p className="text-sm text-gray-500 mb-3">
        שמות שזוהו בקבצי CSV ושויכו לדירות. שיוכים אלה ישמשו לזיהוי אוטומטי בהעלאות עתידיות.
      </p>

      {aliases.length === 0 ? (
        <div className="text-gray-400">אין שיוכי שמות עדיין</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden max-w-2xl">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="טקסט מהבנק" sortKey="alias" currentKey={aliasSortKey} currentDir={aliasSortDir} onSort={requestAliasSort} className="px-4 py-3 text-right" />
                <SortHeader label="דירה" sortKey="apartment_number" currentKey={aliasSortKey} currentDir={aliasSortDir} onSort={requestAliasSort} className="px-4 py-3 text-right" />
                <SortHeader label="בעלים" sortKey="owner_name" currentKey={aliasSortKey} currentDir={aliasSortDir} onSort={requestAliasSort} className="px-4 py-3 text-right" />
                <th className="px-4 py-3 text-right">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={aliasSelection.isAllSelected} onChange={toggleAllAliases} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAliases.map((a: any) => (
                <tr key={a.id} className={`border-t ${aliasSelection.isSelected(a.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-2 font-mono text-sm">{a.alias}</td>
                  <td className="px-4 py-2">{a.apartment_number}</td>
                  <td className="px-4 py-2">{a.owner_name}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDeleteAlias(a.id)}
                      className="text-red-600 hover:underline"
                    >
                      מחיקה
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={aliasSelection.isSelected(a.id)} onChange={() => toggleAlias(a.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-xl font-bold mb-3 mt-8">שיוכי קטגוריות הוצאה</h2>
      <p className="text-sm text-gray-500 mb-3">
        תיאורי הוצאות שזוהו בקבצי CSV ושויכו לקטגוריות. שיוכים אלה ישמשו לזיהוי אוטומטי בהעלאות עתידיות.
      </p>

      {expenseAliases.length === 0 ? (
        <div className="text-gray-400">אין שיוכי קטגוריות עדיין</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden max-w-2xl">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <SortHeader label="טקסט מהבנק" sortKey="alias" currentKey={eaSortKey} currentDir={eaSortDir} onSort={requestEASort} className="px-4 py-3 text-right" />
                <SortHeader label="קטגוריה" sortKey="category" currentKey={eaSortKey} currentDir={eaSortDir} onSort={requestEASort} className="px-4 py-3 text-right" />
                <th className="px-4 py-3 text-right">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={expenseAliasSelection.isAllSelected} onChange={toggleAllExpenseAliases} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedExpenseAliases.map((a: any) => (
                <tr key={a.id} className={`border-t ${expenseAliasSelection.isSelected(a.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-2 font-mono text-sm">{a.alias}</td>
                  <td className="px-4 py-2">{a.category}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => handleDeleteExpenseAlias(a.id)}
                      className="text-red-600 hover:underline"
                    >
                      מחיקה
                    </button>
                  </td>
                  <td className="px-4 py-2">
                    <input type="checkbox" checked={expenseAliasSelection.isSelected(a.id)} onChange={() => toggleExpenseAlias(a.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-xl font-bold mb-3 mt-8 text-red-700">איפוס נתונים</h2>
      <p className="text-sm text-gray-500 mb-3">
        מחיקת נתונים מהמערכת. פעולה זו בלתי הפיכה.
      </p>
      <div className="bg-red-50 border border-red-200 rounded-lg shadow p-6 mb-8 max-w-lg">
        <label className="flex items-center gap-2 mb-4 font-medium text-red-800 border-b border-red-200 pb-3">
          <input
            type="checkbox"
            ref={el => { if (el) el.indeterminate = resetEntities.size > 0 && resetEntities.size < RESET_OPTIONS.length }}
            checked={resetEntities.size === RESET_OPTIONS.length}
            onChange={toggleAllResetEntities}
          />
          בחירת הכל
        </label>
        <div className="space-y-3 mb-6">
          {RESET_OPTIONS.map(opt => (
            <label key={opt.key} className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={resetEntities.has(opt.key)}
                onChange={() => toggleResetEntity(opt.key)}
                className="mt-1"
              />
              <span>
                <span className="font-medium">{opt.label}</span>
                {opt.note && <span className="text-xs text-red-600 block">{opt.note}</span>}
              </span>
            </label>
          ))}
        </div>
        <button
          onClick={handleReset}
          disabled={resetEntities.size === 0 || resetting}
          className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resetting ? 'מאפס...' : 'איפוס'}
        </button>
      </div>

      <BulkActionBar
        count={aliasSelection.count + expenseAliasSelection.count}
        onClear={() => { aliasSelection.clear(); expenseAliasSelection.clear() }}
        actions={[
          { label: 'מחיקת שיוכי שמות', onClick: handleBulkDeleteAliases, show: aliasSelection.count > 0, className: 'bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700' },
          { label: 'מחיקת שיוכי קטגוריות', onClick: handleBulkDeleteExpenseAliases, show: expenseAliasSelection.count > 0, className: 'bg-red-600 text-white px-4 py-1.5 rounded hover:bg-red-700' },
        ]}
      />
    </div>
  )
}
