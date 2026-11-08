import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModalProvider, useModal } from './ModalContext'

function TestAlert() {
  const { showAlert } = useModal()
  return (
    <button onClick={async () => { await showAlert('הודעת בדיקה') }}>
      trigger-alert
    </button>
  )
}

function TestConfirm({ onResult }: { onResult: (v: boolean) => void }) {
  const { showConfirm } = useModal()
  return (
    <button onClick={async () => { onResult(await showConfirm('למחוק?')) }}>
      trigger-confirm
    </button>
  )
}

describe('ModalContext', () => {
  it('throws when useModal is used outside ModalProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestAlert />)).toThrow('useModal must be used within a ModalProvider')
    spy.mockRestore()
  })

  it('showAlert renders a modal and resolves on confirm click', async () => {
    render(
      <ModalProvider>
        <TestAlert />
      </ModalProvider>
    )

    await userEvent.click(screen.getByText('trigger-alert'))
    expect(screen.getByText('הודעת בדיקה')).toBeInTheDocument()

    await userEvent.click(screen.getByText('אישור'))
    expect(screen.queryByText('הודעת בדיקה')).not.toBeInTheDocument()
  })

  it('showConfirm resolves true when user clicks confirm', async () => {
    const onResult = vi.fn()
    render(
      <ModalProvider>
        <TestConfirm onResult={onResult} />
      </ModalProvider>
    )

    await userEvent.click(screen.getByText('trigger-confirm'))
    expect(screen.getByText('למחוק?')).toBeInTheDocument()

    await act(async () => {
      await userEvent.click(screen.getByText('אישור'))
    })
    expect(onResult).toHaveBeenCalledWith(true)
  })

  it('showConfirm resolves false when user clicks cancel', async () => {
    const onResult = vi.fn()
    render(
      <ModalProvider>
        <TestConfirm onResult={onResult} />
      </ModalProvider>
    )

    await userEvent.click(screen.getByText('trigger-confirm'))
    expect(screen.getByText('למחוק?')).toBeInTheDocument()

    await act(async () => {
      await userEvent.click(screen.getByText('ביטול'))
    })
    expect(onResult).toHaveBeenCalledWith(false)
  })
})
