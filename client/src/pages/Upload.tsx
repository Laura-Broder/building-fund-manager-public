import { useState, useEffect } from 'react'
import { previewCsv, parseCsvWithMapping, confirmUpload, getApartments, getCategories, getFiles } from '../api'
import { useModal } from '../context/ModalContext'
import FileList from '../components/FileList'

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

// Data fields that CSV columns can be mapped to
const DATA_FIELDS = [
  { key: '', label: '— לא בשימוש —' },
  { key: 'date', label: 'תאריך', required: true },
  { key: 'description', label: 'תיאור', required: true },
  { key: 'details', label: 'פרטים' },
  { key: 'reference', label: 'אסמכתא' },
  { key: 'debit', label: 'חובה (הוצאות)' },
  { key: 'credit', label: 'זכות (תשלומים)' },
  { key: 'balance', label: 'יתרה' },
]

// Auto-detect known Bank Hapoalim headers
function autoDetectMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  for (const header of headers) {
    const h = header.trim()
    if (h.includes('תאריך') && !h.includes('ערך')) {
      if (!mapping.date) mapping.date = header
    } else if (h.includes('תיאור')) {
      if (!mapping.description) mapping.description = header
    } else if (h === 'פרטים') {
      if (!mapping.details) mapping.details = header
    } else if (h.includes('אסמכתא')) {
      if (!mapping.reference) mapping.reference = header
    } else if (h.includes('חובה')) {
      if (!mapping.debit) mapping.debit = header
    } else if (h.includes('זכות')) {
      if (!mapping.credit) mapping.credit = header
    } else if (h.includes('יתרה')) {
      if (!mapping.balance) mapping.balance = header
    }
  }
  return mapping
}

interface Transaction {
  date: string
  description: string
  details: string
  sender_name: string
  reference: string
  debit: number | null
  credit: number | null
  balance: number | null
  type: 'payment' | 'expense'
  matched_apartment_id: number | null
  matched_apartment_name: string | null
  matched_apartment_number: string | null
  suggested_months: { month: number; year: number }[]
  suggested_category: string
  category_alias_match: boolean
  already_imported: boolean
  // User editable fields
  selected: boolean
  apartment_id: number | null
  months: { month: number; year: number }[]
  category: string
  save_alias: boolean
  save_category_alias: boolean
  pending_review: boolean
}

export default function Upload() {
  const [apartments, setApartments] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [step, setStep] = useState<'upload' | 'mapping' | 'review' | 'done'>('upload')
  const { showConfirm } = useModal()
  const [fileListRefresh, setFileListRefresh] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')

  // Mapping step state
  const [fileId, setFileId] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [autoDetected, setAutoDetected] = useState(false)

  // Review step state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    getApartments().then(setApartments)
    getCategories().then(cats => setCategories(cats.map((c: any) => c.name)))
  }, [])

  const handleFile = async (file: File) => {
    setError('')
    try {
      const existingFiles = await getFiles()
      const duplicate = existingFiles.find((f: any) => f.original_name === file.name)
      if (duplicate && !await showConfirm(`הקובץ "${file.name}" כבר הועלה בעבר.\nלהמשיך בכל זאת?`)) return
    } catch {
      // If the check fails, proceed with upload anyway
    }
    setUploading(true)
    try {
      const data = await previewCsv(file)
      setFileId(data.fileId)
      setHeaders(data.headers)
      setSampleRows(data.sampleRows)

      // Auto-detect column mapping
      const detected = autoDetectMapping(data.headers)
      setColumnMapping(detected)

      // Check if we got all required fields
      const hasRequired = !!(detected.date && detected.description && (detected.debit || detected.credit))
      setAutoDetected(hasRequired)

      setStep('mapping')
    } catch (e: any) {
      setError(e.message || 'שגיאה בהעלאת הקובץ')
    } finally {
      setUploading(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  // Get which data field a header is mapped to
  const getFieldForHeader = (header: string): string => {
    for (const [field, h] of Object.entries(columnMapping)) {
      if (h === header) return field
    }
    return ''
  }

  // Set mapping: a header → a data field
  const setMapping = (header: string, field: string) => {
    setAutoDetected(false)
    setColumnMapping(prev => {
      const next = { ...prev }
      // Remove previous assignment of this header
      for (const [k, v] of Object.entries(next)) {
        if (v === header) delete next[k]
      }
      // Remove previous header assigned to this field (if any)
      if (field) {
        next[field] = header
      }
      return next
    })
  }

  const isMappingValid = () => {
    return columnMapping.date && columnMapping.description && (columnMapping.debit || columnMapping.credit)
  }

  const handleParse = async () => {
    if (!isMappingValid()) return
    setParsing(true)
    setError('')
    try {
      const data = await parseCsvWithMapping(fileId, columnMapping)
      const txns = data.transactions.map((t: any) => ({
        ...t,
        selected: !t.already_imported,
        apartment_id: t.matched_apartment_id,
        months: t.suggested_months,
        category: t.suggested_category,
        save_alias: t.matched_apartment_id !== null && t.type === 'payment' && !t.already_imported,
        save_category_alias: false,
        pending_review: false,
      }))
      setTransactions(txns)
      setStep('review')
    } catch (e: any) {
      setError(e.message || 'שגיאה בניתוח הקובץ')
    } finally {
      setParsing(false)
    }
  }

  const updateTxn = (index: number, updates: Partial<Transaction>) => {
    setTransactions(prev => prev.map((t, i) => i === index ? { ...t, ...updates } : t))
  }

  const assignApartment = (index: number, apartmentId: number | null) => {
    const txn = transactions[index]
    const name = txn.sender_name
    setTransactions(prev => prev.map((t, i) => {
      if (i === index) {
        return { ...t, apartment_id: apartmentId, save_alias: !!apartmentId }
      }
      // Auto-update other unmatched transactions with the same sender_name
      if (name && t.sender_name === name && t.type === 'payment' && !t.apartment_id) {
        return { ...t, apartment_id: apartmentId, save_alias: !!apartmentId }
      }
      return t
    }))
  }

  const assignCategory = (index: number, category: string) => {
    const txn = transactions[index]
    const name = txn.sender_name
    setTransactions(prev => prev.map((t, i) => {
      if (i === index) {
        return { ...t, category }
      }
      if (name && t.sender_name === name && t.type === 'expense') {
        return { ...t, category }
      }
      return t
    }))
  }

  const handleConfirm = async () => {
    setConfirming(true)
    setError('')
    try {
      const rows = transactions
        .filter(t => t.selected)
        .map(t => ({
          date: t.date,
          description: t.description,
          sender_name: t.sender_name,
          reference: t.reference,
          type: t.type,
          amount: t.type === 'payment' ? t.credit! : t.debit!,
          apartment_id: t.apartment_id,
          months: t.months,
          category: t.category,
          vendor: t.type === 'expense' ? (t.sender_name || t.description) : undefined,
          save_alias: t.save_alias,
          save_category_alias: t.save_category_alias,
          pending_review: t.pending_review,
        }))
      const res = await confirmUpload(rows, fileId)
      setResult(res)
      setStep('done')
      setFileListRefresh(prev => prev + 1)
    } catch (e: any) {
      setError(e.message || 'שגיאה בשמירה')
    } finally {
      setConfirming(false)
    }
  }

  const selectedPayments = transactions.filter(t => t.selected && t.type === 'payment')
  const selectedExpenses = transactions.filter(t => t.selected && t.type === 'expense')
  const duplicateCount = transactions.filter(t => t.already_imported).length
  const pendingReviewCount = transactions.filter(t => t.selected && t.pending_review).length

  // Split and sort transactions by type for the review step.
  // Unassigned items first, then by date within each group.
  const paymentTxns = transactions
    .map((txn, i) => ({ txn, i }))
    .filter(({ txn }) => txn.type === 'payment')
    .sort((a, b) => {
      const aUnassigned = a.txn.apartment_id === null ? 0 : 1
      const bUnassigned = b.txn.apartment_id === null ? 0 : 1
      if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned
      return a.txn.date.localeCompare(b.txn.date)
    })
  const expenseTxns = transactions
    .map((txn, i) => ({ txn, i }))
    .filter(({ txn }) => txn.type === 'expense')
    .sort((a, b) => {
      const aUnassigned = a.txn.category_alias_match ? 1 : 0
      const bUnassigned = b.txn.category_alias_match ? 1 : 0
      if (aUnassigned !== bUnassigned) return aUnassigned - bUnassigned
      return a.txn.date.localeCompare(b.txn.date)
    })

  // Upload step
  if (step === 'upload') {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">ייבוא קבצים</h1>
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          }`}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            id="file-input"
            type="file"
            accept=".csv"
            onChange={handleFileInput}
            className="hidden"
          />
          {uploading ? (
            <div className="text-blue-600 text-lg">מעלה ומנתח את הקובץ...</div>
          ) : (
            <>
              <div className="text-4xl mb-4 text-gray-400">📄</div>
              <div className="text-lg text-gray-600">גרור קובץ CSV לכאן או לחץ לבחירה</div>
              <div className="text-sm text-gray-400 mt-2">תומך בקבצי CSV מכל בנק</div>
            </>
          )}
        </div>
        {error && <div className="mt-4 text-red-600 text-center">{error}</div>}
        <div className="mt-10">
          <FileList refreshTrigger={fileListRefresh} />
        </div>
      </div>
    )
  }

  // Mapping step
  if (step === 'mapping') {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">מיפוי עמודות</h1>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep('upload'); setHeaders([]); setSampleRows([]); setFileId('') }}
              className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
            >
              חזרה
            </button>
            <button
              onClick={handleParse}
              disabled={!isMappingValid() || parsing}
              className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {parsing ? 'מנתח...' : 'המשך'}
            </button>
          </div>
        </div>

        {autoDetected && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded mb-4">
            זוהה אוטומטית: בנק הפועלים — ניתן לשנות את המיפוי אם צריך
          </div>
        )}

        {error && <div className="mb-4 text-red-600">{error}</div>}

        {!isMappingValid() && (
          <div className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded mb-4">
            יש למפות לפחות: תאריך, תיאור, וחובה או זכות
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                {headers.map((h, i) => (
                  <th key={i} className="px-3 py-2 text-right font-bold min-w-[140px]">
                    {h}
                  </th>
                ))}
              </tr>
              <tr className="bg-blue-50 border-b">
                {headers.map((h, i) => (
                  <td key={i} className="px-3 py-2">
                    <select
                      value={getFieldForHeader(h)}
                      onChange={e => setMapping(h, e.target.value)}
                      className={`w-full border rounded px-2 py-1 text-sm ${
                        getFieldForHeader(h) ? 'border-green-400 bg-green-50' : 'border-gray-300'
                      }`}
                    >
                      {DATA_FIELDS.map(f => {
                        // Disable fields already assigned to another header
                        const assignedTo = f.key ? columnMapping[f.key] : undefined
                        const disabled = !!assignedTo && assignedTo !== h
                        return (
                          <option key={f.key} value={f.key} disabled={disabled}>
                            {f.label}{f.required ? ' *' : ''}{disabled ? ' (בשימוש)' : ''}
                          </option>
                        )
                      })}
                    </select>
                  </td>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, ri) => (
                <tr key={ri} className="border-t">
                  {headers.map((h, hi) => (
                    <td key={hi} className="px-3 py-2 text-gray-600 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
                      {row[h] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          <span className="font-medium">שדות חובה:</span> תאריך *, תיאור *, חובה או זכות *
        </div>
      </div>
    )
  }

  // Done step
  if (step === 'done') {
    return (
      <div className="text-center py-16">
        <div className="text-5xl mb-4">✅</div>
        <h2 className="text-2xl font-bold mb-4">הייבוא הושלם בהצלחה</h2>
        <p className="text-gray-600 mb-2">
          תשלומים שנוספו: <strong>{result?.paymentsAdded || 0}</strong>
        </p>
        <p className="text-gray-600 mb-2">
          הוצאות שנוספו: <strong>{result?.expensesAdded || 0}</strong>
        </p>
        {result?.skippedDuplicates > 0 && (
          <p className="text-gray-400 mb-6">
            כפילויות שדולגו: {result.skippedDuplicates}
          </p>
        )}
        <button
          onClick={() => { setStep('upload'); setTransactions([]); setResult(null) }}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
        >
          העלאת קובץ נוסף
        </button>
      </div>
    )
  }

  // Review step
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">סקירת תנועות</h1>
        <div className="flex gap-3">
          <button
            onClick={() => { setStep('upload'); setTransactions([]) }}
            className="border border-gray-300 px-4 py-2 rounded hover:bg-gray-50"
          >
            ביטול
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {confirming ? 'שומר...' : `אישור ושמירה (${selectedPayments.length + selectedExpenses.length} תנועות)`}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 text-red-600">{error}</div>}

      <div className="flex gap-4 mb-4 text-sm">
        <span className="bg-green-100 text-green-700 px-3 py-1 rounded">
          תשלומים: {selectedPayments.length}
        </span>
        <span className="bg-red-100 text-red-700 px-3 py-1 rounded">
          הוצאות: {selectedExpenses.length}
        </span>
        {pendingReviewCount > 0 && (
          <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded">
            לבדיקה: {pendingReviewCount}
          </span>
        )}
        {duplicateCount > 0 && (
          <span className="bg-gray-200 text-gray-600 px-3 py-1 rounded">
            כבר יובאו: {duplicateCount}
          </span>
        )}
      </div>

      {paymentTxns.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-green-700 mb-2">תשלומים ({paymentTxns.length})</h2>
          <div className="space-y-3 mb-8">
            {paymentTxns.map(({ txn, i }) => (
              <div
                key={i}
                className={`bg-white rounded-lg shadow p-4 border-r-4 ${
                  txn.already_imported ? 'opacity-40 border-gray-300' :
                  !txn.selected ? 'opacity-50 border-gray-300' : 'border-green-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={txn.selected}
                    onChange={e => updateTxn(i, { selected: e.target.checked })}
                    className="mt-1"
                    disabled={txn.already_imported}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        {txn.already_imported && (
                          <span className="bg-gray-300 text-gray-700 text-xs px-2 py-0.5 rounded ml-2">כבר יובא</span>
                        )}
                        {txn.sender_name && (
                          <span className="font-bold text-blue-800 ml-2">{txn.sender_name}</span>
                        )}
                        <span className={txn.sender_name ? 'text-gray-500' : 'font-bold'}>{txn.description}</span>
                        <span className="text-gray-400 text-sm mr-2">{txn.date}</span>
                        {txn.reference && <span className="text-gray-400 text-sm mr-2">אסמכתא: {txn.reference}</span>}
                      </div>
                      <div className="font-bold text-lg" dir="ltr">
                        <span className="text-green-700">+₪{txn.credit?.toLocaleString()}</span>
                      </div>
                    </div>

                    {txn.selected && (
                      <div className="flex flex-wrap gap-3 items-center text-sm">
                        <select
                          value={txn.type}
                          onChange={e => updateTxn(i, { type: e.target.value as 'payment' | 'expense' })}
                          className="border rounded px-2 py-1"
                        >
                          <option value="payment">תשלום</option>
                          <option value="expense">הוצאה</option>
                        </select>

                        <label className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer ${
                          txn.pending_review ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' : 'text-gray-500'
                        }`}>
                          <input
                            type="checkbox"
                            checked={txn.pending_review}
                            onChange={e => updateTxn(i, { pending_review: e.target.checked })}
                          />
                          לבדיקה?
                        </label>

                        <select
                          value={txn.apartment_id ?? ''}
                          onChange={e => assignApartment(i, e.target.value ? Number(e.target.value) : null)}
                          className={`border rounded px-2 py-1 ${!txn.apartment_id ? 'border-orange-400 bg-orange-50' : ''}`}
                        >
                          <option value="">בחר דירה</option>
                          {apartments.map((apt: any) => (
                            <option key={apt.id} value={apt.id}>
                              דירה {apt.number} - {apt.owner_name}
                            </option>
                          ))}
                        </select>

                        <div className="flex gap-1 items-center">
                          <span>חודשים:</span>
                          {txn.months.map((m, mi) => (
                            <span key={mi} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                              {MONTHS[m.month - 1]} {m.year}
                              {txn.months.length > 1 && (
                                <button
                                  onClick={() => {
                                    const newMonths = txn.months.filter((_, j) => j !== mi)
                                    updateTxn(i, { months: newMonths })
                                  }}
                                  className="mr-1 text-blue-400 hover:text-red-500"
                                >×</button>
                              )}
                            </span>
                          ))}
                        </div>

                        {txn.apartment_id && (
                          <label className="flex items-center gap-1 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={txn.save_alias}
                              onChange={e => updateTxn(i, { save_alias: e.target.checked })}
                            />
                            זכור שיוך
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {expenseTxns.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-red-700 mb-2">הוצאות ({expenseTxns.length})</h2>
          <div className="space-y-3">
            {expenseTxns.map(({ txn, i }) => (
              <div
                key={i}
                className={`bg-white rounded-lg shadow p-4 border-r-4 ${
                  txn.already_imported ? 'opacity-40 border-gray-300' :
                  !txn.selected ? 'opacity-50 border-gray-300' : 'border-red-500'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={txn.selected}
                    onChange={e => updateTxn(i, { selected: e.target.checked })}
                    className="mt-1"
                    disabled={txn.already_imported}
                  />
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        {txn.already_imported && (
                          <span className="bg-gray-300 text-gray-700 text-xs px-2 py-0.5 rounded ml-2">כבר יובא</span>
                        )}
                        {txn.sender_name && (
                          <span className="font-bold text-blue-800 ml-2">{txn.sender_name}</span>
                        )}
                        <span className={txn.sender_name ? 'text-gray-500' : 'font-bold'}>{txn.description}</span>
                        <span className="text-gray-400 text-sm mr-2">{txn.date}</span>
                        {txn.reference && <span className="text-gray-400 text-sm mr-2">אסמכתא: {txn.reference}</span>}
                      </div>
                      <div className="font-bold text-lg" dir="ltr">
                        <span className="text-red-700">-₪{txn.debit?.toLocaleString()}</span>
                      </div>
                    </div>

                    {txn.selected && (
                      <div className="flex flex-wrap gap-3 items-center text-sm">
                        <select
                          value={txn.type}
                          onChange={e => updateTxn(i, { type: e.target.value as 'payment' | 'expense' })}
                          className="border rounded px-2 py-1"
                        >
                          <option value="payment">תשלום</option>
                          <option value="expense">הוצאה</option>
                        </select>

                        <label className={`flex items-center gap-1 text-xs px-2 py-1 rounded cursor-pointer ${
                          txn.pending_review ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' : 'text-gray-500'
                        }`}>
                          <input
                            type="checkbox"
                            checked={txn.pending_review}
                            onChange={e => updateTxn(i, { pending_review: e.target.checked })}
                          />
                          לבדיקה?
                        </label>

                        <select
                          value={txn.category}
                          onChange={e => assignCategory(i, e.target.value)}
                          className={`border rounded px-2 py-1 ${txn.category_alias_match ? 'border-green-400 bg-green-50' : ''}`}
                        >
                          {categories.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                        {txn.category_alias_match && (
                          <span className="text-xs text-green-600">זוהה אוטומטית</span>
                        )}
                        <label className="flex items-center gap-1 text-xs text-gray-500">
                          <input
                            type="checkbox"
                            checked={txn.save_category_alias}
                            onChange={e => updateTxn(i, { save_category_alias: e.target.checked })}
                          />
                          זכור קטגוריה
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
