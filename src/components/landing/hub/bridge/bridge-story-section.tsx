"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLayoutEffect, useRef } from "react";
import { useSafeReducedMotion } from "@/lib/motion";
import { createBridgeTimeline } from "./bridge-animation";
import { BridgeConnector } from "./bridge-connector";
import { BridgeCopyPane } from "./bridge-copy-pane";
import { BridgeScene } from "./bridge-scene";

export function BridgeStorySection() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduce = useSafeReducedMotion();

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || reduce) return;

    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      createBridgeTimeline(root);
    }, root);

    return () => ctx.revert();
  }, [reduce]);

  return (
    <div
      ref={rootRef}
      className={reduce ? "hub-bridge-root is-static" : "hub-bridge-root"}
    >
      <div className="hub-bridge-track" data-bridge-track>
        <div className="hub-bridge-pin" data-bridge-pin>
          <div className="hub-shell hub-bridge-shell">
            <p className="hub-kicker">The bridge</p>
            <div className="hub-bridge-stage" data-bridge-stage>
              <BridgeScene />
              <BridgeCopyPane />
              <BridgeConnector />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
