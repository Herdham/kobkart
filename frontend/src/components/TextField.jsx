import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function TextField({ icon: Icon, type = 'text', error, ...props }) {
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div className="field-wrap">
      <div className={`field ${error ? 'has-error' : ''}`}>
        {Icon && <Icon className="field-icon" size={18} />}
        <input {...props} type={isPassword && show ? 'text' : type} />
        {isPassword && (
          <button
            type="button"
            className="field-toggle"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
