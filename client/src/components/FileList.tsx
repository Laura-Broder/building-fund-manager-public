import { useState, useEffect } from 'react'
import { getFiles, deleteFile, getFileDownloadUrl, bulkDeleteFiles } from '../api'
import { useSelection } from '../hooks/useSelection'
import { useSort } from '../hooks/useSort'
import { useModal } from '../context/ModalContext'
import BulkActionBar from './BulkActionBar'
import SortHeader from './SortHeader'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('he-IL', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function FileList({ refreshTrigger }: { refreshTrigger?: number }) {
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { showConfirm } = useModal()

  const loadFiles = async () => {
    try {
      const data = await getFiles()
      setFiles(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadFiles() }, [refreshTrigger])

  const handleDelete = async (id: number, name: string) => {
    if (!await showConfirm(`למחוק קובץ זה? (${name})\nהתנועות שיובאו ממנו לא יימחקו.`)) return
    await deleteFile(id)
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const selection = useSelection(files)
  const { sortedItems: sortedFiles, sortKey, sortDir, requestSort } = useSort(files, 'upload_date', 'desc')

  const handleBulkDelete = async () => {
    if (!await showConfirm(`למחוק ${selection.count} קבצים?\nהתנועות שיובאו מהם לא יימחקו.`)) return
    await bulkDeleteFiles(selection.selectedArray)
    selection.clear()
    loadFiles()
  }

  if (loading) {
    return <div className="text-center py-16 text-gray-500">טוען...</div>
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">קבצים שהועלו</h2>

      {files.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-4">📁</div>
          <p>לא הועלו קבצים עדיין</p>
          <p className="text-sm mt-2">קבצים שמיובאים דרך העלאת קובץ ישמרו כאן</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <SortHeader label="שם הקובץ" sortKey="original_name" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right font-bold" />
                <SortHeader label="תאריך העלאה" sortKey="upload_date" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right font-bold" />
                <SortHeader label="גודל" sortKey="size" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right font-bold" />
                <SortHeader label="תשלומים" sortKey="payments_imported" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right font-bold" />
                <SortHeader label="הוצאות" sortKey="expenses_imported" currentKey={sortKey} currentDir={sortDir} onSort={requestSort} className="px-4 py-3 text-right font-bold" />
                <th className="px-4 py-3 text-right font-bold">פעולות</th>
                <th className="px-4 py-3">
                  <input type="checkbox" checked={selection.isAllSelected} onChange={selection.toggleAll} />
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map(file => (
                <tr key={file.id} className={`border-t hover:bg-gray-50 ${selection.isSelected(file.id) ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 font-medium">{file.original_name}</td>
                  <td className="px-4 py-3 text-gray-600">{formatDate(file.upload_date)}</td>
                  <td className="px-4 py-3 text-gray-600" dir="ltr">{formatSize(file.size)}</td>
                  <td className="px-4 py-3">
                    {file.payments_imported > 0 && (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">{file.payments_imported}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {file.expenses_imported > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">{file.expenses_imported}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <a
                        href={getFileDownloadUrl(file.id)}
                        download
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        הורדה
                      </a>
                      <button
                        onClick={() => handleDelete(file.id, file.original_name)}
                        className="text-red-600 hover:text-red-800 hover:underline"
                      >
                        מחיקה
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selection.isSelected(file.id)} onChange={() => selection.toggle(file.id)} />
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
