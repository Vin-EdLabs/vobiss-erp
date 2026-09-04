import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ensureChatThread } from '@/api/chat';
import { useToast } from '@/hooks/use-toast';

type RecordType = 'ticket' | 'material_request' | 'cash_request' | 'item_return' | 'project_request' | 'wip_entry';

interface RecordChatButtonProps {
  recordType: RecordType;
  recordId: string | number;
  chatChannelId?: string | null;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'icon';
  className?: string;
}

export function RecordChatButton({
  recordType,
  recordId,
  chatChannelId,
  variant = 'outline',
  size = 'sm',
  className,
}: RecordChatButtonProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const openChat = (channelId: string) => {
    navigate(`/chat?channel=${encodeURIComponent(channelId)}`);
  };

  const handleClick = async () => {
    // Always call ensureChatThread, even when chatChannelId is already known — the channel may
    // already exist from someone else opening it first, but this viewer (e.g. Sales opening a
    // ticket CX already chatted on) was never added as a member, and just navigating to an
    // existing channel they're not in renders a blank chat page. ensureChatThread both creates
    // the channel if needed AND adds the caller as a member either way, so it's always safe.
    setLoading(true);
    try {
      const { channelId } = await ensureChatThread(recordType, recordId);
      openChat(channelId);
    } catch (e) {
      toast({
        title: 'Could not open chat thread',
        description: e instanceof Error ? e.message : 'Please try again',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <MessageSquare className="mr-1.5 h-4 w-4" />
      )}
      {chatChannelId ? 'Open chat' : 'Start thread'}
    </Button>
  );
}

export default RecordChatButton;
