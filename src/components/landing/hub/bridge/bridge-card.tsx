import type { BridgeStoryKey } from "./bridge-stories";

export function BridgeCard({ layer }: { layer: BridgeStoryKey }) {
  return (
    <div
      className={`hub-bridge-card hub-bridge-card-${layer}`}
      data-bridge-card={layer}
    >
      <div className="hub-bridge-card-bottom" />
      <div className="hub-bridge-card-front" />
      <div className="hub-bridge-card-side" />
      <div className="hub-bridge-card-top">
        <div className="hub-bridge-anchor" data-bridge-anchor={layer} />
      </div>
    </div>
  );
}
