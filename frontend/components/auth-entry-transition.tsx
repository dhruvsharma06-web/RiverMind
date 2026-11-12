"use client";

import { Component, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

interface Props {
  pathname: string;
  signedIn: boolean;
  children: ReactNode;
}
interface Snapshot {
  page: HTMLElement;
  kind: "login" | "logout";
}
const workspacePath =
  /^\/(river|atlas|bounties|donate|reports|about|council)(\/|$)/;

// This boundary persists across the login/dashboard layouts, so it can capture
// either view before React removes it and reveal the actual destination.
class AuthEntryBoundary extends Component<
  Props,
  Record<string, never>,
  Snapshot | null
> {
  private layer: HTMLDivElement | null = null;
  private animation: Animation | null = null;
  private awaitingLogin = false;
  private timeout = 0;
  private sequence = 0;

  getSnapshotBeforeUpdate(previous: Props): Snapshot | null {
    const entering =
      previous.pathname === "/login" &&
      this.props.signedIn &&
      workspacePath.test(this.props.pathname);
    const leaving =
      previous.signedIn &&
      !this.props.signedIn &&
      workspacePath.test(previous.pathname);
    if (
      (!entering && !leaving) ||
      typeof Element.prototype.animate !== "function" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return null;
    const source = document.querySelector<HTMLElement>(
      entering ? ".auth-page" : ".app-shell",
    );
    if (!source) return null;
    const bounds = source.getBoundingClientRect();
    const copy = source.cloneNode(true) as HTMLElement;
    Object.assign(copy.style, {
      position: "absolute",
      top: `${bounds.top}px`,
      left: `${bounds.left}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    });
    copy.removeAttribute("id");
    const ids = new Map<string, string>();
    const prefix = `auth-snapshot-${++this.sequence}-`;
    copy.querySelectorAll("[id]").forEach((node) => {
      ids.set(node.id, `${prefix}${node.id}`);
      node.id = ids.get(node.id)!;
    });
    copy.querySelectorAll("*").forEach((node) => {
      for (const attribute of [...node.attributes]) {
        const value = attribute.value.replace(
          /url\(#([^)]+)\)/g,
          (reference, id: string) =>
            ids.has(id) ? `url(#${ids.get(id)})` : reference,
        );
        if (value !== attribute.value) node.setAttribute(attribute.name, value);
      }
    });
    // A visual copy has no need to retain the submitted password.
    copy
      .querySelectorAll<HTMLInputElement>('input[type="password"]')
      .forEach((input) => {
        input.value = "";
        input.removeAttribute("value");
      });
    return { page: copy, kind: entering ? "login" : "logout" };
  }

  componentDidUpdate(
    previous: Props,
    _state: Record<string, never>,
    snapshot: Snapshot | null,
  ) {
    if (!snapshot) {
      if (
        this.awaitingLogin &&
        this.props.pathname === "/login" &&
        !this.props.signedIn
      )
        this.reveal();
      else if (
        previous.pathname !== this.props.pathname ||
        (previous.signedIn && !this.props.signedIn)
      )
        this.clearSnapshot();
      return;
    }
    this.clearSnapshot();
    const layer = document.createElement("div");
    layer.className = "auth-entry-transition";
    layer.dataset.kind = snapshot.kind;
    layer.setAttribute("aria-hidden", "true");
    layer.inert = true;
    layer.append(snapshot.page);
    document.body.append(layer);
    this.layer = layer;
    if (snapshot.kind === "logout" && this.props.pathname !== "/login") {
      // AuthGate removes protected content immediately. Keep only this inert
      // copy until its redirect commits; never defer session revocation.
      this.awaitingLogin = true;
      this.timeout = window.setTimeout(() => this.clearSnapshot(), 5000);
    } else this.reveal();
  }

  private reveal() {
    if (!this.layer) return;
    this.awaitingLogin = false;
    window.clearTimeout(this.timeout);
    this.animation = this.layer.animate(
      [{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(100% 0 0 0)" }],
      { duration: 480, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" },
    );
    this.animation.onfinish = () => this.clearSnapshot();
  }

  private clearSnapshot() {
    window.clearTimeout(this.timeout);
    this.awaitingLogin = false;
    this.animation?.cancel();
    this.animation = null;
    this.layer?.remove();
    this.layer = null;
  }

  componentWillUnmount() {
    this.clearSnapshot();
  }

  render() {
    return this.props.children;
  }
}

export function AuthEntryTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useAuth();
  return (
    <AuthEntryBoundary pathname={pathname} signedIn={status === "signed-in"}>
      {children}
    </AuthEntryBoundary>
  );
}
