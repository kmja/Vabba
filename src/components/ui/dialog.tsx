"use client";

import { useEffect, useRef } from "react";
import { IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * A modal built on the native `<dialog>` element — its own focus trap, ESC
 * handling and backdrop, so none of that is hand-rolled here.
 */
export function Dialog({
  open,
  onClose,
  title,
  footer,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        // A click that lands on the ::backdrop is a click on the <dialog>
        // element itself, not on anything inside it.
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "bg-card text-card-foreground m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border p-0 shadow-lg",
        "backdrop:bg-black/40 open:animate-in open:fade-in open:zoom-in-95 open:duration-150",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Stäng"
          className="text-muted-foreground hover:text-foreground hover:bg-secondary -mr-1.5 rounded-md p-1.5"
        >
          <IconX className="size-4" />
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">{children}</div>
      {footer && (
        <div className="bg-card/95 flex items-center justify-end gap-2 border-t px-4 py-3 backdrop-blur">
          {footer}
        </div>
      )}
    </dialog>
  );
}
