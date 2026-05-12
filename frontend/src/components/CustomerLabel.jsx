function getTextColor(hexColor) {
  const hex = hexColor?.replace('#', '') || 'd6e400'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.58 ? '#111' : '#fff'
}

export default function CustomerLabel({ label, closable = false, onClose, size = 'default' }) {
  const background = label?.color || '#d6e400'
  const color = getTextColor(background)
  const padding = closable ? (size === 'small' ? '1px 3px 1px 6px' : '2px 3px 2px 8px') : (size === 'small' ? '1px 6px' : '2px 7px')
  const fontSize = size === 'small' ? 11 : 12

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: 160,
        minHeight: size === 'small' ? 18 : 22,
        padding,
        borderRadius: 999,
        background,
        color,
        fontSize,
        fontWeight: 500,
        lineHeight: 1.2,
        verticalAlign: 'middle',
      }}
      title={label?.internal_note || label?.name}
    >
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label?.name}
      </span>
      {closable && (
        <button
          type="button"
          aria-label={`Bỏ label ${label?.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onClose?.(label)
          }}
          style={{
            width: size === 'small' ? 14 : 16,
            height: size === 'small' ? 14 : 16,
            border: 0,
            borderRadius: '50%',
            padding: 0,
            color: '#fff',
            background: '#111',
            cursor: 'pointer',
            fontSize: size === 'small' ? 11 : 12,
            lineHeight: 1,
          }}
        >
          x
        </button>
      )}
    </span>
  )
}
