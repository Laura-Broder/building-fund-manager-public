import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BulkActionBar from './BulkActionBar'

describe('BulkActionBar', () => {
  it('renders nothing when count is 0', () => {
    const { container } = render(
      <BulkActionBar count={0} actions={[]} onClear={() => {}} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('shows count text and clear button', () => {
    render(
      <BulkActionBar
        count={3}
        actions={[]}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('3 פריטים נבחרו')).toBeInTheDocument()
    expect(screen.getByText('ביטול בחירה')).toBeInTheDocument()
  })

  it('calls onClear when clear button is clicked', async () => {
    const onClear = vi.fn()
    render(
      <BulkActionBar count={2} actions={[]} onClear={onClear} />
    )
    await userEvent.click(screen.getByText('ביטול בחירה'))
    expect(onClear).toHaveBeenCalledOnce()
  })

  it('hides actions with show=false', () => {
    render(
      <BulkActionBar
        count={1}
        actions={[
          { label: 'מחיקה', onClick: () => {}, show: true },
          { label: 'אישור', onClick: () => {}, show: false },
        ]}
        onClear={() => {}}
      />
    )
    expect(screen.getByText('מחיקה')).toBeInTheDocument()
    expect(screen.queryByText('אישור')).not.toBeInTheDocument()
  })

  it('calls action onClick when button is clicked', async () => {
    const onClick = vi.fn()
    render(
      <BulkActionBar
        count={1}
        actions={[{ label: 'מחיקה', onClick }]}
        onClear={() => {}}
      />
    )
    await userEvent.click(screen.getByText('מחיקה'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
