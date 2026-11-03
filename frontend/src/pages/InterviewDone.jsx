import { Card, CardContent } from '@/components/ui/card'
import { SuccessTick } from '@/components/interview/CompletionIcons'

export default function InterviewDone() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center">
            <SuccessTick />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Interview submitted</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Thank you. Your answers and recordings have been saved and sent for evaluation. The
            hiring team will review your interview and get back to you.
          </p>
          <p className="mt-4 text-xs text-muted-foreground">You can close this tab.</p>
          <p className="mt-6 text-xs text-muted-foreground">
            Facing any difficulty? Write to us at{' '}
            <a className="link" href="mailto:yash@dotstark.com">
              yash@dotstark.com
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
