import { Children, isValidElement, useId } from 'react'
import type { ReactNode, SelectHTMLAttributes } from 'react'

type Props = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'defaultValue' | 'onChange' | 'multiple'> & {
  value: string; onValueChange: (value: string) => void
}

// Two actionable choices stay visible. Native radios retain keyboard and form behavior.
export function ChoiceSelect({ value, onValueChange, children, ...props }: Props) {
  const group = useId()
  const options = Children.toArray(children).filter(child => isValidElement<{ value: string; disabled?: boolean; children?: ReactNode }>(child) && child.type === 'option' && !child.props.disabled)
  if (options.length !== 2) return <select {...props} value={value} onChange={event => onValueChange(event.target.value)}>{children}</select>
  const items = options.filter(isValidElement<{ value: string; children?: ReactNode }>)
  const selected = items.findIndex(item => String(item.props.value) === value)
  return <fieldset className={`binary-choice ${props.className || ''}`} role="radiogroup" aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} id={props.id} disabled={props.disabled} data-active={selected < 0 ? 'none' : selected === 0 ? 'start' : 'end'}>
    {items.map(item => {
      const label = Children.toArray(item.props.children).filter(child => typeof child === 'string' || typeof child === 'number').join('')
      return <label key={String(item.props.value)}><input type="radio" name={props.name || group} value={String(item.props.value)} checked={String(item.props.value) === value} required={props.required} onChange={() => onValueChange(String(item.props.value))} /><span title={label}>{item.props.children}</span></label>
    })}
  </fieldset>
}
