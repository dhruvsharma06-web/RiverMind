export type ToastTone = "success" | "error" | "info";
export function toast(message: string, tone: ToastTone = "success") {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent("rivermind:toast", {
        detail: { message: message.slice(0, 240), tone },
      }),
    );
}
