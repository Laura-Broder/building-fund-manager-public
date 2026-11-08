import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { ModalProvider } from './context/ModalContext'
import Dashboard from './pages/Dashboard'
import Monthly from './pages/Monthly'
import Residents from './pages/Residents'
import Payments from './pages/Payments'
import Expenses from './pages/Expenses'
import SpecialPayments from './pages/SpecialPayments'
import Upload from './pages/Upload'
import Analytics from './pages/Analytics'
import Settings from './pages/Settings'

export default function App() {
  return (
    <ModalProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/monthly" element={<Monthly />} />
          <Route path="/residents" element={<Residents />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/special-payments" element={<SpecialPayments />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/files" element={<Navigate to="/upload" replace />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ModalProvider>
  )
}
