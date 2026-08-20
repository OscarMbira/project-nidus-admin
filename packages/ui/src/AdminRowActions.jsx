export function AdminRowActions({ className = '', children }) {
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {children}
    </div>
  )
}
