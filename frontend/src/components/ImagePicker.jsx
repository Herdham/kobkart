import { ImagePlus, X } from 'lucide-react'
import { compressImage } from '../api/http'

export default function ImagePicker({ value, onChange, onError, label = 'Add photo' }) {
  async function pick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      onChange(await compressImage(file))
    } catch (err) {
      onError?.(err.message)
    }
  }

  return (
    <div className="db-upload">
      {value ? (
        <>
          <img src={value} alt="" />
          <button type="button" className="db-upload-x" onClick={() => onChange(null)} aria-label="Remove photo">
            <X size={16} />
          </button>
        </>
      ) : (
        <label>
          <ImagePlus size={24} />
          <span>{label}</span>
          <input type="file" accept="image/*" hidden onChange={pick} />
        </label>
      )}
    </div>
  )
}