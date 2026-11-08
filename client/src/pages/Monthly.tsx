import { useState, useEffect } from 'react'
import { getDashboard } from '../api'

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

export default function Monthly() {
  const now = new Date()
  const [month, setMonth] = useState<number | null>(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getDashboard(year, month || undefined)
      .then(setData)
      .finally(() => setLoading(false))
  }, [month, year])

  if (loading) return <div className="text-center py-10 text-gray-500">טוען...</div>
  if (!data) return <div className="text-center py-10 text-red-500">שגיאה בטעינת נתונים</div>

  const isYearly = month === null
  const expectedPerApartment = data.monthly_fee * (data.months_in_scope || 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">סיכום {isYearly ? 'שנתי' : 'חודשי'}</h1>
        <div className="flex gap-2 items-center">
          {month !== null ? (
            <>
              <select
                value={month}
                onChange={e => setMonth(Number(e.target.value))}
                className="border rounded px-3 py-2"
              >
                {MONTHS.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <button
                onClick={() => setMonth(null)}
                className="px-2 py-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                title="הצג שנה שלמה"
              >✕</button>
            </>
          ) : (
            <button
              onClick={() => setMonth(now.getFullYear() === year ? now.getMonth() + 1 : 1)}
              className="border rounded px-3 py-2 text-blue-600 hover:bg-blue-50"
            >חודשי</button>
          )}
          <input
            type="number"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border rounded px-3 py-2 w-24"
            dir="ltr"
          />
          <button
            onClick={() => { setMonth(now.getMonth() + 1); setYear(now.getFullYear()) }}
            className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700"
          >
            היום
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="צפי גבייה" value={`₪${data.total_expected.toLocaleString()}`} color="blue" />
        <Card label="נגבה" value={`₪${data.total_collected.toLocaleString()}`} color="green" />
        <Card label={isYearly ? 'חוב השנה' : 'חוב החודש'} value={`₪${data.outstanding.toLocaleString()}`} color="red" />
        <Card label={isYearly ? 'הוצאות השנה' : 'הוצאות החודש'} value={`₪${data.total_expenses.toLocaleString()}`} color="orange" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="שילמו" value={data.paid_count} color="green" />
        <Card label="לא שילמו" value={data.unpaid_count} color="red" />
        <Card label={isYearly ? 'יתרה שנתית' : 'יתרה חודשית'} value={`₪${data.balance.toLocaleString()}`} color="blue" />
        <Card label="סה״כ דירות" value={data.total_apartments} color="gray" />
      </div>

      {/* Payment Grid */}
      <h2 className="text-xl font-bold mb-3">
        סטטוס תשלומים - {isYearly ? year : `${MONTHS[month - 1]} ${year}`}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-8">
        {data.apartments.map((apt: any) => {
          const paidFull = apt.payment_amount >= expectedPerApartment
          const paidPartial = !paidFull && apt.payment_amount > 0
          return (
            <div
              key={apt.id}
              className={`rounded-lg p-3 border-2 ${
                paidFull
                  ? 'border-green-400 bg-green-50'
                  : paidPartial
                    ? 'border-yellow-400 bg-yellow-50'
                    : 'border-red-300 bg-red-50'
              }`}
            >
              <div className="font-bold">דירה {apt.number}</div>
              <div className="text-sm text-gray-600">{apt.owner_name}</div>
              <div className={`text-sm font-bold mt-1 ${
                paidFull ? 'text-green-700' : paidPartial ? 'text-yellow-700' : 'text-red-700'
              }`}>
                {paidFull
                  ? `✓ ₪${apt.payment_amount.toLocaleString()}`
                  : paidPartial
                    ? `חלקי ₪${apt.payment_amount.toLocaleString()}`
                    : 'לא שולם'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    green: 'bg-green-50 border-green-200 text-green-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    orange: 'bg-orange-50 border-orange-200 text-orange-800',
    gray: 'bg-gray-50 border-gray-200 text-gray-800',
  }
  return (
    <div className={`rounded-lg border p-4 ${colors[color] || colors.gray}`}>
      <div className="text-sm opacity-75">{label}</div>
      <div className="text-2xl font-bold mt-1" dir="ltr">{value}</div>
    </div>
  )
}
