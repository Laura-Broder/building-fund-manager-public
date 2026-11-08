import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Modal from './Modal'

describe('Modal', () => {
  it('renders message text', () => {
    render(<Modal message="שגיאה בשמירה" type="alert" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('שגיאה בשמירה')).toBeInTheDocument()
  })

  it('renders only confirm button for alert type', () => {
    render(<Modal message="הודעה" type="alert" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('אישור')).toBeInTheDocument()
    expect(screen.queryByText('ביטול')).not.toBeInTheDocument()
  })

  it('renders confirm and cancel buttons for confirm type', () => {
    render(<Modal message="למחוק?" type="confirm" onConfirm={() => {}} onCancel={() => {}} />)
    expect(screen.getByText('אישור')).toBeInTheDocument()
    expect(screen.getByText('ביטול')).toBeInTheDocument()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(<Modal message="הודעה" type="alert" onConfirm={onConfirm} onCancel={() => {}} />)
    await userEvent.click(screen.getByText('אישור'))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const onCancel = vi.fn()
    render(<Modal message="למחוק?" type="confirm" onConfirm={() => {}} onCancel={onCancel} />)
    await userEvent.click(screen.getByText('ביטול'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel on Escape key', async () => {
    const onCancel = vi.fn()
    render(<Modal message="הודעה" type="alert" onConfirm={() => {}} onCancel={onCancel} />)
    await userEvent.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('calls onConfirm on Enter key', async () => {
    const onConfirm = vi.fn()
    render(<Modal message="הודעה" type="alert" onConfirm={onConfirm} onCancel={() => {}} />)
    await userEvent.keyboard('{Enter}')
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('calls onCancel when backdrop is clicked', async () => {
    const onCancel = vi.fn()
    render(<Modal message="הודעה" type="alert" onConfirm={() => {}} onCancel={onCancel} />)
    // The backdrop is the outer div with the fixed class
    const backdrop = screen.getByText('הודעה').closest('.fixed')!
    await userEvent.click(backdrop)
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
