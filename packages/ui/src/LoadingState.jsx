export function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center p-12 text-gray-400">
      <span className="animate-pulse">{message}</span>
    </div>
  )
}

export function EmptyState({ title, description }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-700 p-12 text-center">
      <p className="text-lg text-gray-300">{title}</p>
      {description && <p className="mt-2 text-sm text-gray-500">{description}</p>}
    </div>
  )
}
