// ============================================================
// Toast 通知组件 — 左下角，带左侧色条
// ============================================================

import { useState, useCallback, createContext, useContext } from "react";
import type { ReactNode } from "react";

interface ToastItem {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

interface ToastContextType {
  toast: (message: string, type?: ToastItem["type"]) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 0;

const accent: Record<ToastItem["type"], string> = {
  success: "bg-sage",
  error: "bg-rose",
  info: "bg-cinnabar",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback(
    (message: string, type: ToastItem["type"] = "info") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 left-5 z-50 flex max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() =>
              setToasts((prev) => prev.filter((x) => x.id !== t.id))
            }
            className="flex animate-slide-in-right items-stretch cursor-pointer overflow-hidden rounded-lg border border-ink-700 bg-ink-850/95 text-sm shadow-lg backdrop-blur"
          >
            <span className={`w-1 shrink-0 ${accent[t.type]}`} />
            <span className="px-3.5 py-3 text-paper">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
