'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { usersService } from '@/lib/services';

export function UserActionsMenu({
  username,
  blocked,
  onBlockChanged,
}: {
  username: string;
  blocked: boolean;
  onBlockChanged: (blocked: boolean) => void | Promise<void>;
}) {
  const toast = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  async function toggleBlock() {
    setOpen(false);
    setBusy(true);
    try {
      await (blocked ? usersService.unblock(username) : usersService.block(username));
      await onBlockChanged(!blocked);
      toast.success(blocked ? `Unblocked @${username}` : `Blocked @${username}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update block');
    } finally {
      setBusy(false);
    }
  }

  async function submitReport() {
    if (!reason.trim()) return;
    setBusy(true);
    try {
      await usersService.report(username, reason.trim());
      toast.success(`Report for @${username} sent`);
      setReportOpen(false);
      setReason('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send report');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          type="button"
          aria-label="More actions"
          onClick={() => setOpen((value) => !value)}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-elevated text-muted transition-colors hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
        {open && (
          <div className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-border bg-surface p-1 shadow-xl">
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleBlock()}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-elevated disabled:opacity-50"
            >
              {blocked ? 'Unblock' : 'Block'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReportOpen(true);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-elevated"
            >
              Report
            </button>
          </div>
        )}
      </div>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title={`Report @${username}`}
        description="Tell us what is wrong with this account."
        footer={
          <>
            <Button variant="ghost" onClick={() => setReportOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => void submitReport()}>
              Send report
            </Button>
          </>
        }
      >
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
          maxLength={500}
          placeholder="Reason for reporting…"
        />
      </Modal>
    </>
  );
}
