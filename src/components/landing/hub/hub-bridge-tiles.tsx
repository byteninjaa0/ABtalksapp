import Image from "next/image";

const CANDIDATE_ITEMS = [
  "Hackathons — weekend builds, judged and archived",
  "Cohorts — multi-week programs with mentors",
  "Challenges — scoped problems from real companies",
];

const COMPANY_ITEMS = [
  "Browse candidates by what they shipped",
  "Send us the role and the skills you need",
  "We build a cohort against that requirement",
];

type BridgeTile = {
  key: "candidates" | "abtalks" | "companies";
  kicker: string;
  title: string;
  body?: string;
  items?: string[];
  stack: { src: string; width: number; height: number };
  arrow: string;
};

const TILES: BridgeTile[] = [
  {
    key: "candidates",
    kicker: "For the candidates",
    title: "Make yourself visible by building.",
    items: CANDIDATE_ITEMS,
    stack: {
      src: "/landing/bridge/tile-candidates.png",
      width: 1750,
      height: 2016,
    },
    arrow: "/landing/bridge/arrow-candidates.svg",
  },
  {
    key: "abtalks",
    kicker: "The bridge",
    title: "ABTalks",
    body: "We run the programs, score the work, and match evidence to requirements. Profiles move only when the candidate releases them.",
    stack: {
      src: "/landing/bridge/tile-abtalks.png",
      width: 1892,
      height: 2160,
    },
    arrow: "/landing/bridge/arrow-abtalks.svg",
  },
  {
    key: "companies",
    kicker: "For the companies",
    title: "Hire from proof, or commission it.",
    items: COMPANY_ITEMS,
    stack: {
      src: "/landing/bridge/tile-companies.png",
      width: 2062,
      height: 2160,
    },
    arrow: "/landing/bridge/arrow-companies.svg",
  },
];

export function HubBridgeTiles() {
  return (
    <section id="about" className="hub-bridge-section">
      <div className="hub-shell hub-bridge-shell">
        <p className="hub-kicker">The bridge</p>
        <h2 className="hub-h2">
          Talent on one side. Requirements on the other.
        </h2>
        <div className="hub-bridge-panels">
          {TILES.map((tile) => (
            <article
              key={tile.key}
              className="hub-bridge-panel"
              data-tile={tile.key}
            >
              <div className="hub-bridge-visual">
                <Image
                  src={tile.stack.src}
                  alt=""
                  width={tile.stack.width}
                  height={tile.stack.height}
                  className="hub-bridge-stack"
                  sizes="(max-width: 800px) 80vw, 40vw"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={tile.arrow}
                  alt=""
                  className="hub-bridge-arrows"
                  aria-hidden
                />
              </div>
              <div className="hub-bridge-copy">
                <p className="hub-kicker">{tile.kicker}</p>
                <h3 className="hub-bridge-title">{tile.title}</h3>
                {tile.body ? (
                  <p className="hub-bridge-body">{tile.body}</p>
                ) : null}
                {tile.items ? (
                  <ul className="hub-bridge-list">
                    {tile.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
