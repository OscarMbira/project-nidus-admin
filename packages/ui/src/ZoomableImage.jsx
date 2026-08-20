import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * Thumbnail that enlarges on hover and opens a full-size lightbox on click.
 * Used on the Admin Profile page for picture and signature previews (v207 / monorepo v894).
 */
export function ZoomableImage({
  src,
  alt,
  imgClassName = '',
  hoverPreviewClassName = 'max-h-64 max-w-xs object-contain',
  priority = false,
}) {
  const [lightbox, setLightbox] = useState(false)
  const [hoverRect, setHoverRect] = useState(null)

  useEffect(() => {
    if (!lightbox) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setLightbox(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [lightbox])

  if (!src) return null

  const showHover = (element) => {
    if (!element) return
    setHoverRect(element.getBoundingClientRect())
  }

  const hoverStyle = hoverRect
    ? (() => {
        const placeAbove = window.innerHeight - hoverRect.bottom < 280
        return {
          left: hoverRect.left + hoverRect.width / 2,
          top: placeAbove ? hoverRect.top - 8 : hoverRect.bottom + 8,
          transform: placeAbove ? 'translate(-50%, -100%)' : 'translateX(-50%)',
        }
      })()
    : null

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setHoverRect(null)
          setLightbox(true)
        }}
        onMouseEnter={(event) => showHover(event.currentTarget)}
        onMouseLeave={() => setHoverRect(null)}
        onFocus={(event) => showHover(event.currentTarget)}
        onBlur={() => setHoverRect(null)}
        title="Hover or click to enlarge"
        aria-label={`Enlarge ${alt}`}
        className="relative z-10 inline-flex cursor-zoom-in overflow-visible rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <img
          src={src}
          alt={alt}
          className={imgClassName}
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
        />
      </button>
      {hoverRect && !lightbox && createPortal(
        <div
          data-testid="zoomable-hover-preview"
          className="pointer-events-none fixed z-[70] rounded-lg border border-gray-700 bg-gray-800 p-2 shadow-xl"
          style={hoverStyle}
        >
          <img src={src} alt="" className={hoverPreviewClassName} />
        </div>,
        document.body,
      )}
      {lightbox && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setLightbox(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[85vh] max-w-[90vw] rounded-lg bg-white object-contain p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          />
        </div>,
        document.body,
      )}
    </>
  )
}

export default ZoomableImage
