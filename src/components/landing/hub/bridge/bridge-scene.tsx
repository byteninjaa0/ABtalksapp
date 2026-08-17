import { BridgeCard } from "./bridge-card";

export function BridgeScene() {
  return (
    <div className="hub-bridge-scene" data-bridge-scene>
      <div className="hub-bridge-scene-inner">
        <BridgeCard layer="candidates" />
        <BridgeCard layer="abtalks" />
        <BridgeCard layer="companies" />
      </div>
    </div>
  );
}
