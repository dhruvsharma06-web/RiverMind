"use client";

import { Component, createRef, type ReactNode } from "react";

interface Props {
  pathname: string;
  routes: readonly string[];
  children: ReactNode;
}
interface PageSnapshot {
  page: HTMLElement;
  forward: boolean;
  left: number;
  top: number;
}

// The pre-commit lifecycle captures the outgoing DOM before the router replaces
// it, including Back/Forward navigation. Only an inert visual copy survives for
// 420ms; no old React tree, queries, or event handlers stay mounted.
export class WorkspacePage extends Component<
  Props,
  Record<string, never>,
  PageSnapshot | null
> {
  private main = createRef<HTMLElement>();
  private layer: HTMLDivElement | null = null;
  private animation: Animation | null = null;
  private sequence = 0;

  componentDidMount() {
    // Outside the changing shell: Overview's viewport-specific selectors must
    // not restyle an outgoing treasury/report page while it is still visible.
    this.layer = document.createElement("div");
    this.layer.className = "workspace-route-transition";
    this.layer.setAttribute("aria-hidden", "true");
    this.layer.inert = true;
    document.body.append(this.layer);
  }

  getSnapshotBeforeUpdate(previous: Props): PageSnapshot | null {
    const main = this.main.current;
    const layer = this.layer;
    if (
      previous.pathname === this.props.pathname ||
      !main ||
      !layer ||
      typeof layer.animate !== "function" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return null;

    const index = (path: string) =>
      this.props.routes.findIndex(
        (href) => path === href || path.startsWith(`${href}/`),
      );
    const from = index(previous.pathname);
    const to = index(this.props.pathname);
    if (from < 0 || to < 0) return null;

    const bounds = main.getBoundingClientRect();
    const shell = main.closest<HTMLElement>(".app-shell");
    const header = shell?.querySelector(".app-topbar")?.getBoundingClientRect();
    if (!header) return null;
    const page = document.createElement("div");
    page.className = `${shell?.className ?? "app-shell"} workspace-page-snapshot`;
    page.style.cssText = shell?.style.cssText ?? "";
    const copy = main.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    Object.assign(copy.style, {
      position: "absolute",
      left: `${bounds.left - header.left}px`,
      top: `${bounds.top - header.bottom}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      maxWidth: "none",
      margin: "0",
    });

    // Keep SVG gradient references local and avoid duplicate document IDs.
    const ids = new Map<string, string>();
    const prefix = `route-snapshot-${++this.sequence}-`;
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
    page.append(copy);
    return {
      page,
      left: header.left,
      top: header.bottom,
      forward:
        to === from
          ? !previous.pathname.startsWith(`${this.props.pathname}/`)
          : to > from,
    };
  }

  componentDidUpdate(
    previous: Props,
    _state: Record<string, never>,
    snapshot: PageSnapshot | null,
  ) {
    if (previous.pathname === this.props.pathname) return;
    this.clearSnapshot();
    const layer = this.layer;
    if (!snapshot || !layer) return;
    layer.replaceChildren(snapshot.page);
    layer.style.left = `${snapshot.left}px`;
    layer.style.top = `${snapshot.top}px`;
    layer.style.visibility = "visible";
    // A chevron edge reveals the new page over the outgoing visual, with no
    // solid curtain or waiting for async data. Placeholders can enter immediately.
    const masks = snapshot.forward
      ? [
          "polygon(-10% 0, 120% 0, 120% 100%, -10% 100%, 0% 50%)",
          "polygon(100% 0, 120% 0, 120% 100%, 100% 100%, 110% 50%)",
        ]
      : [
          "polygon(-20% 0, 110% 0, 100% 50%, 110% 100%, -20% 100%)",
          "polygon(-20% 0, 0% 0, -10% 50%, 0% 100%, -20% 100%)",
        ];
    this.animation = layer.animate(
      masks.map((clipPath) => ({ clipPath })),
      { duration: 420, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "both" },
    );
    this.animation.onfinish = () => this.clearSnapshot();
  }

  private clearSnapshot() {
    this.animation?.cancel();
    this.animation = null;
    this.layer?.replaceChildren();
    if (this.layer) this.layer.style.visibility = "hidden";
  }

  componentWillUnmount() {
    this.clearSnapshot();
    this.layer?.remove();
    this.layer = null;
  }

  render() {
    return (
      <main ref={this.main} id="main-content" className="app-content">
        {this.props.children}
      </main>
    );
  }
}
