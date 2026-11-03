import { Badge } from '@/components/ui/badge'

const VARIANTS = {
  cv_processing: 'secondary',
  ats_review: 'secondary',
  ats_error: 'destructive',
  rejected: 'destructive',
  shortlisted: 'info',
  interview_sent: 'info',
  interview_in_progress: 'info',
  interview_completed: 'warning',
  evaluation_pending: 'warning',
  evaluation_error: 'destructive',
  evaluation_completed: 'success',
  manual_review: 'success',
  selected: 'success',
  not_started: 'secondary',
  in_progress: 'info',
  completed: 'success',
}

export default function StatusBadge({ status }) {
  if (!status) return <span className="text-sm text-muted-foreground">-</span>
  return <Badge variant={VARIANTS[status] || 'secondary'}>{status.replace(/_/g, ' ')}</Badge>
}
