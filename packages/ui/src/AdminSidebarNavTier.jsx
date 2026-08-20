import { getAdminSidebarNavTierClassName } from './sidebarNavUtils.js'

/**
 * One drill-down tier in the admin sidebar navigation tree.
 */
export function AdminSidebarNavTier({ children, borderClassName = 'border-gray-700', className = '' }) {
  return (
    <div className={`${getAdminSidebarNavTierClassName(borderClassName)}${className ? ` ${className}` : ''}`}>
      {children}
    </div>
  )
}
