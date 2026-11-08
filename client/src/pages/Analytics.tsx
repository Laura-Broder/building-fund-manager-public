import { useState, useEffect, useCallback } from 'react'
import { getAnalytics } from '../api'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const MONTH_NAMES = ['ינ', 'פב', 'מר', 'אפ', 'מא', 'יו', 'יול', 'או', 'ספ', 'או', 'נו', 'דצ']
const COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

export default function Analytics() {
  const now = new Date()
  const [fromYear, setFromYear] = useState(now.getFullYear())
  const [toYear, setToYear] = useState(now.getFullYear())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    setLoading(true)
    getAnalytics({ from_year: fromYear, to_year: toYear })
      .then(setData)
      .finally(() => setLoading(false))
  }, [fromYear, toYear])

  useEffect(() => { load() }, [load])

  const chartData = data?.monthly?.map((m: any) => ({
    label: `${MONTH_NAMES[m.month - 1]}' ${String(m.year).slice(-2)}`,
    ...m,
  })) || []

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">ניתוח נתונים</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500">משנה</label>
          <input
            type="number"
            value={fromYear}
            onChange={e => setFromYear(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20 text-sm"
            dir="ltr"
          />
          <label className="text-sm text-gray-500">עד</label>
          <input
            type="number"
            value={toYear}
            onChange={e => setToYear(Number(e.target.value))}
            className="border rounded px-2 py-1 w-20 text-sm"
            dir="ltr"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">טוען...</div>
      ) : !data ? (
        <div className="text-center py-10 text-gray-400">אין נתונים להצגה</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Collection Rate */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-bold mb-3">אחוז גביה</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis domain={[0, 100]} fontSize={11} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: any) => [`${v}%`, 'אחוז גביה']} />
                <Line type="monotone" dataKey="collection_rate" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Income vs Expenses */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-bold mb-3">הכנסות מול הוצאות</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `₪${v}`} />
                <Tooltip formatter={(v: any, name: any) => [`₪${Number(v).toLocaleString()}`, name === 'income' ? 'הכנסות' : 'הוצאות']} />
                <Legend formatter={v => v === 'income' ? 'הכנסות' : 'הוצאות'} />
                <Bar dataKey="income" fill="#22c55e" />
                <Bar dataKey="expenses" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Expense breakdown by category */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-bold mb-3">פילוח הוצאות לפי קטגוריה</h2>
            {data.category_breakdown.length === 0 ? (
              <div className="text-center py-10 text-gray-400">אין הוצאות בתקופה</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={data.category_breakdown}
                    dataKey="total"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ category, percent }: any) => `${category} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                    fontSize={11}
                  >
                    {data.category_breakdown.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [`₪${Number(v).toLocaleString()}`, '']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Running balance */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-bold mb-3">מאזן מצטבר</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `₪${v}`} />
                <Tooltip formatter={(v: any) => [`₪${Number(v).toLocaleString()}`, 'מאזן']} />
                <Area type="monotone" dataKey="balance" stroke="#8b5cf6" fill="#c4b5fd" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
