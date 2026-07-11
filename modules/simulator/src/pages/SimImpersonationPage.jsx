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

export default function SimImpersonationPage() {
  const [searchParams] = useSearchParams()

  const initialTargetUserId = searchParams.get('userId') || ''
  const initialReason = searchParams.get('reason') || ''
  const initialPageRoute = searchParams.get('route') || ''

  return (
    <UserImpersonationPanel
      fixedTargetSystem="simulator"
      title="Simulator User Impersonation"
      description="Impersonate a Simulator user to reproduce scenario issues, certificate problems, and learning-path errors."
      initialTargetUserId={initialTargetUserId}
      initialReason={initialReason}
      initialPageRoute={initialPageRoute}
      {...uiProps}
    />
  )
}
