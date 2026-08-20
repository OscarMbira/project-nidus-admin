import { getAdminSidebarNavTreeDotClassName, getAdminSidebarNavTreeRowClassName } from './sidebarNavUtils.js'

/**
 * One child row in the admin sidebar nav tree — dot node on the parent tier guide line.
 */
export function AdminSidebarNavTreeRow({ children, dotClassName = 'bg-gray-500', dotStyle, className = '' }) {
  return (
    <div className={`${getAdminSidebarNavTreeRowClassName()}${className ? ` ${className}` : ''}`}>
      <span className={getAdminSidebarNavTreeDotClassName(dotClassName)} style={dotStyle} aria-hidden="true" />
      {children}
    </div>
  )
}
