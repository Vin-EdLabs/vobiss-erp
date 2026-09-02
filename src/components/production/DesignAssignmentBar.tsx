import { useEffect, useState } from 'react';
import { UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  claimDesignRequest, assignDesignRequest, releaseDesignRequest, listDesignUnitMembers,
  type ProjectRequest, type DesignUnitMember,
} from '@/api/project';

/** Shown above the Design stage section whenever a request is sitting at current_stage='design'
 *  — visible to every Design Unit member regardless of who it's assigned to, since even a
 *  locked-out member needs to see who has it. Claiming is required before the survey form opens
 *  up for editing (see canDesignAct in ProductionDetail.tsx). */
export function DesignAssignmentBar({
  request, isDesignMember, currentUserId, canManage, onUpdated,
}: {
  request: ProjectRequest;
  isDesignMember: boolean;
  currentUserId?: number;
  canManage: boolean; // design_manager/admin — can reassign or release on anyone's behalf
  onUpdated: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [members, setMembers] = useState<DesignUnitMember[]>([]);
  const [assigning, setAssigning] = useState(false);
  const [busy, setBusy] = useState(false);

  const isMine = request.design_assigned_to === currentUserId;
  const canRelease = isMine || canManage;

  useEffect(() => {
    if (!isDesignMember) return;
    listDesignUnitMembers().then(setMembers).catch(() => {});
  }, [isDesignMember]);

  if (!isDesignMember) return null;

  const takeIt = async () => {
    setBusy(true);
    try { await claimDesignRequest(request.id); toast({ title: 'Assigned to you' }); await onUpdated(); }
    catch (e) { toast({ title: 'Could not claim this request', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  const assignTo = async (userId: string) => {
    setBusy(true);
    try {
      await assignDesignRequest(request.id, Number(userId));
      const target = members.find((m) => m.id === Number(userId));
      toast({ title: `Assigned to ${target?.name || 'colleague'}` });
      setAssigning(false);
      await onUpdated();
    } catch (e) {
      toast({ title: 'Could not assign this request', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    setBusy(true);
    try { await releaseDesignRequest(request.id); toast({ title: 'Unassigned' }); await onUpdated(); }
    catch (e) { toast({ title: 'Could not release this request', description: e instanceof Error ? e.message : undefined, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-secondary)] p-3.5">
      <div className="flex items-center gap-2 text-sm">
        <UserCheck className="h-4 w-4 text-[var(--text-muted)]" />
        {request.design_assigned_name ? (
          <span className={isMine ? 'font-semibold text-[var(--primary)]' : 'text-[var(--text-secondary)]'}>
            {isMine ? 'Assigned to you' : `Assigned to ${request.design_assigned_name}`}
          </span>
        ) : (
          <span className="font-medium text-amber-700">Unassigned — take it or assign it before working on it</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!request.design_assigned_to && (
          <Button size="sm" disabled={busy} onClick={() => void takeIt()}>Take it</Button>
        )}
        {!request.design_assigned_to && !assigning && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAssigning(true)}>Assign to…</Button>
        )}
        {(request.design_assigned_to ? (isMine || canManage) : true) && assigning && (
          <Select onValueChange={(v) => void assignTo(v)}>
            <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Choose a colleague" /></SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>{m.name}{m.position ? ` — ${m.position}` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {request.design_assigned_to && (isMine || canManage) && !assigning && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setAssigning(true)}>Reassign…</Button>
        )}
        {request.design_assigned_to && canRelease && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void release()}><X className="mr-1 h-3.5 w-3.5" />Release</Button>
        )}
      </div>
    </div>
  );
}
