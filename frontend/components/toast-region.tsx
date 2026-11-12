"use client";
import { useEffect, useState } from "react";
import { CircleCheck, CircleAlert, Info, X } from "lucide-react";
import type { ToastTone } from "@/lib/toasts";
type Item = { id: number; message: string; tone: ToastTone };
export function ToastRegion() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    let sequence = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const receive = (event: Event) => {
      const { message, tone } = (
        event as CustomEvent<{ message: string; tone: ToastTone }>
      ).detail;
      const id = ++sequence;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      const timer = setTimeout(
        () => {
          setItems((current) => current.filter((item) => item.id !== id));
          timers.delete(timer);
        },
        tone === "error" ? 8000 : 5000,
      );
      timers.add(timer);
    };
    window.addEventListener("rivermind:toast", receive);
    return () => {
      window.removeEventListener("rivermind:toast", receive);
      timers.forEach(clearTimeout);
    };
  }, []);
  return (
    <div className="toast-region" aria-label="Notifications">
      {items.map((item) => {
        const Icon =
          item.tone === "error"
            ? CircleAlert
            : item.tone === "info"
              ? Info
              : CircleCheck;
        return (
          <div
            className={`app-toast toast-${item.tone}`}
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
          >
            <Icon size={19} />
            <p>{item.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() =>
                setItems((current) =>
                  current.filter((toast) => toast.id !== item.id),
                )
              }
            >
              <X size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
