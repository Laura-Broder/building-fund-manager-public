import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SortHeader from './SortHeader'

function renderInTable(ui: React.ReactElement) {
  return render(<table><thead><tr>{ui}</tr></thead></table>)
}

describe('SortHeader', () => {
  it('renders the label text', () => {
    renderInTable(
      <SortHeader label="שם" sortKey="name" currentKey="name" currentDir="asc" onSort={() => {}} />
    )
    expect(screen.getByText(/שם/)).toBeInTheDocument()
  })

  it('shows ascending arrow when active and asc', () => {
    renderInTable(
      <SortHeader label="שם" sortKey="name" currentKey="name" currentDir="asc" onSort={() => {}} />
    )
    expect(screen.getByText(/▲/)).toBeInTheDocument()
  })

  it('shows descending arrow when active and desc', () => {
    renderInTable(
      <SortHeader label="שם" sortKey="name" currentKey="name" currentDir="desc" onSort={() => {}} />
    )
    expect(screen.getByText(/▼/)).toBeInTheDocument()
  })

  it('shows no arrow when inactive', () => {
    renderInTable(
      <SortHeader label="שם" sortKey="name" currentKey="age" currentDir="asc" onSort={() => {}} />
    )
    expect(screen.queryByText(/▲/)).not.toBeInTheDocument()
    expect(screen.queryByText(/▼/)).not.toBeInTheDocument()
  })

  it('calls onSort with sortKey when clicked', async () => {
    const onSort = vi.fn()
    renderInTable(
      <SortHeader label="שם" sortKey="name" currentKey="name" currentDir="asc" onSort={onSort} />
    )
    await userEvent.click(screen.getByText(/שם/))
    expect(onSort).toHaveBeenCalledWith('name')
  })
})
