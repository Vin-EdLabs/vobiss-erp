import { useParams } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import { FieldWorkPanel } from '@/components/fieldwork/FieldWorkPanel';

export default function FieldWorkDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--primary)]">Engineering</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-bold text-[var(--text-primary)]"><Wrench className="h-7 w-7" /> Field Work</h1>
      </div>
      <FieldWorkPanel fieldWorkId={Number(id)} />
    </div>
  );
}
