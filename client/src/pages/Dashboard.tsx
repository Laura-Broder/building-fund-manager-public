import { useState, useEffect } from 'react'
import { getDashboard } from '../api'

const MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
]

export default function Dashboard() {
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

  const goBack = () => {
    if (month === null) {
      setYear(y => y - 1)
    } else if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else {
      setMonth(m => m! - 1)
    }
  }

  const goForward = () => {
    if (month === null) {
      setYear(y => y + 1)
    } else if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else {
      setMonth(m => m! + 1)
    }
  }

  if (loading) return <div className="text-center py-10 text-gray-500">טוען...</div>
  if (!data) return <div className="text-center py-10 text-red-500">שגיאה בטעינת נתונים</div>

  const isYearly = month === null

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">לוח בקרה</h1>
          <div className="flex items-center gap-1 bg-white rounded-lg shadow px-2 py-1">
            <button onClick={goBack} className="px-2 py-1 hover:bg-gray-100 rounded text-gray-600">&lt;</button>
            <span className="font-medium px-2 min-w-[120px] text-center">
              {month ? `${MONTHS[month - 1]} ${year}` : year}
            </span>
            <button onClick={goForward} className="px-2 py-1 hover:bg-gray-100 rounded text-gray-600">&gt;</button>
            {month !== null ? (
              <button
                onClick={() => setMonth(null)}
                className="mr-1 px-2 py-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 text-sm"
                title="הצג שנה שלמה"
              >✕</button>
            ) : (
              <button
                onClick={() => setMonth(now.getFullYear() === year ? now.getMonth() + 1 : 1)}
                className="mr-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
              >חודשי</button>
            )}
          </div>
        </div>
        <span className="text-sm text-gray-400">
          עדכון אחרון: {data.last_update
            ? new Date(data.last_update + 'Z').toLocaleString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'אין נתונים'}
        </span>
      </div>

      {/* Overall Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card label="סה״כ דירות" value={data.total_apartments} color="gray" />
        <Card label="דמי ועד חודשיים" value={`₪${data.monthly_fee}`} color="blue" />
        <Card label="סה״כ נגבה" value={`₪${data.lifetime_collected.toLocaleString()}`} color="green" />
        <Card label="סה״כ הוצאות" value={`₪${data.lifetime_expenses.toLocaleString()}`} color="orange" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card label="יתרה בקופה" value={`₪${data.lifetime_balance.toLocaleString()}`} color="blue" />
        <Card label="סה״כ חובות" value={`₪${data.lifetime_total_debt.toLocaleString()}`} color="red" />
        <Card
          label={isYearly ? 'שילמו השנה' : 'שילמו החודש'}
          value={`${data.paid_count} / ${data.total_apartments}`}
          color="green"
        />
        <Card
          label={isYearly ? 'לא שילמו השנה' : 'לא שילמו החודש'}
          value={data.unpaid_count}
          color="red"
        />
      </div>

      {/* Current Owner Debts */}
      {data.current_owner_debts && data.current_owner_debts.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-3 text-red-700">חובות דיירים נוכחיים ({MONTHS[data.debt_start_month - 1]} {data.debt_start_year} עד {isYearly ? year : `${MONTHS[data.month - 1]} ${data.year}`})</h2>
          <DebtTable debts={data.current_owner_debts} />
        </>
      )}

      {/* Previous Owner Debts */}
      {data.previous_owner_debts && data.previous_owner_debts.length > 0 && (
        <details className="mb-8">
          <summary className="text-lg font-bold text-orange-700 cursor-pointer hover:text-orange-800 mb-3">
            חובות דיירים קודמים ({data.previous_owner_debts.length})
          </summary>
          <DebtTable debts={data.previous_owner_debts} />
        </details>
      )}

      {/* Fallback for old API response without segmentation */}
      {!data.current_owner_debts && data.debts && data.debts.length > 0 && (
        <>
          <h2 className="text-xl font-bold mb-3 text-red-700">חובות</h2>
          <DebtTable debts={data.debts} />
        </>
      )}

    </div>
  )
}

function DebtTable({ debts }: { debts: any[] }) {
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
      <table className="w-full">
        <thead className="bg-red-50">
          <tr>
            <th className="px-4 py-3 text-right">דירה</th>
            <th className="px-4 py-3 text-right">שם</th>
            <th className="px-4 py-3 text-right">חודשים חסרים</th>
            <th className="px-4 py-3 text-right">סה״כ חוב</th>
          </tr>
        </thead>
        <tbody>
          {debts.map((d: any, idx: number) => (
            <tr key={`${d.apartment_id}-${d.owner_name}-${idx}`} className="border-t hover:bg-red-50">
              <td className="px-4 py-3 font-bold">{d.number}</td>
              <td className="px-4 py-3">{d.owner_name}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1">
                  {d.unpaid_months.map((um: any, i: number) => (
                    <span key={i} className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">
                      {MONTHS[um.month - 1]} {um.year}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 font-bold text-red-700" dir="ltr">₪{d.total_debt.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
