export default function SortHeader({ label, sortKey, currentKey, currentDir, onSort, className }: {
  label: string
  sortKey: string
  currentKey: string
  currentDir: 'asc' | 'desc'
  onSort: (key: string) => void
  className?: string
}) {
  const active = sortKey === currentKey
  return (
    <th
      className={`${className || ''} cursor-pointer select-none hover:bg-gray-100`}
      onClick={() => onSort(sortKey)}
    >
      {label} {active ? (currentDir === 'asc' ? '▲' : '▼') : ''}
    </th>
  )
}
