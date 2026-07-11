import { useSearchParams } from 'react-router-dom'
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

export default function PlatformImpersonationPage() {
  const [searchParams] = useSearchParams()

  const initialTargetUserId = searchParams.get('userId') || ''
  const initialReason = searchParams.get('reason') || ''
  const initialPageRoute = searchParams.get('route') || ''

  return (
    <UserImpersonationPanel
      fixedTargetSystem="platform"
      title="Platform User Impersonation"
      description="Impersonate a Platform user to reproduce errors, verify permissions, and troubleshoot account issues."
      initialTargetUserId={initialTargetUserId}
      initialReason={initialReason}
      initialPageRoute={initialPageRoute}
      {...uiProps}
    />
  )
}
