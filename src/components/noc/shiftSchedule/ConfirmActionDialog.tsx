import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmActionState {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

/** Single reusable confirmation dialog for every destructive action on this page. */
export function ConfirmActionDialog({ state, onOpenChange }: { state: ConfirmActionState | null; onOpenChange: (open: boolean) => void }) {
  return (
    <AlertDialog open={!!state} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{state?.title}</AlertDialogTitle>
          <AlertDialogDescription>{state?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => state?.onConfirm()} className="bg-[var(--danger)] hover:opacity-90">
            {state?.confirmLabel || 'Confirm'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
