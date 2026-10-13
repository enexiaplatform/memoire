import { useId, useState, type InputHTMLAttributes } from 'react';
import { Input } from './Input';

export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label?: string; helperText?: string }) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const inputId = props.id || id;
  return <div>
    <Input {...props} id={inputId} type={visible ? 'text' : 'password'} />
    <button type="button" aria-controls={inputId} aria-pressed={visible} onClick={() => setVisible(value => !value)} className="mt-1 min-h-11 text-sm font-semibold text-brand-blue">
      {visible ? 'Hide password' : 'Show password'}
    </button>
  </div>;
}
