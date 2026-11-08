import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const navItems = [
  { to: '/', label: 'לוח בקרה' },
  { to: '/monthly', label: 'סיכום חודשי' },
  { to: '/residents', label: 'דיירים' },
  { to: '/payments', label: 'תשלומים' },
  { to: '/special-payments', label: 'גבייה מיוחדת' },
  { to: '/expenses', label: 'הוצאות' },
  { to: '/upload', label: 'ייבוא קבצים' },
  { to: '/analytics', label: 'ניתוח נתונים' },
  { to: '/settings', label: 'הגדרות' },
]

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-blue-800 text-white flex-shrink-0">
        <div className="p-4 text-xl font-bold border-b border-blue-700">
          מנהל ועד בית
        </div>
        <nav className="mt-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block px-4 py-3 hover:bg-blue-700 transition-colors ${
                  isActive ? 'bg-blue-900 font-bold' : ''
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        {children}
      </main>
    </div>
  )
}
