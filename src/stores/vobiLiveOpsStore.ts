import { create } from 'zustand';

/** Whether the Vobi Live Ops Feed panel is open — read by VobiLauncher so the floating
 * Vobi chat button (bottom-right) hides itself instead of overlapping the feed panel. */
type VobiLiveOpsState = {
  open: boolean;
  setOpen: (open: boolean) => void;
};

export const useVobiLiveOpsStore = create<VobiLiveOpsState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
