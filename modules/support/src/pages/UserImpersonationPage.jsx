import { UserImpersonationPanel } from '@nidus-admin/shared'
import {
  AdminBadge,
  AdminTable,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
} from '@nidus-admin/ui'

const uiProps = {
  AdminTable,
  AdminBadge,
  EmptyState,
  LoadingState,
  SearchBar,
  useConfirmAction,
  useToast,
}

export default function UserImpersonationPage() {
  return (
    <UserImpersonationPanel
      title="User Impersonation"
      description="Start supervised impersonation sessions across Platform or Simulator and review log history."
      {...uiProps}
    />
  )
}
