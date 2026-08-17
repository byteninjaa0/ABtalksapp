import { BRIDGE_STORIES } from "./bridge-stories";

export function BridgeCopyPane() {
  return (
    <div className="hub-bridge-copy-pane" data-bridge-copy-pane>
      <h2 className="hub-h2 hub-bridge-intro" data-bridge-copy="intro">
        Talent on one side. Requirements on the other.
      </h2>
      {BRIDGE_STORIES.map((story) => (
        <article
          key={story.key}
          className="hub-bridge-copy-panel"
          data-bridge-copy={story.key}
        >
          <p className="hub-kicker">{story.kicker}</p>
          <h3 className="hub-bridge-title">{story.title}</h3>
          {story.body ? <p className="hub-bridge-body">{story.body}</p> : null}
          {story.items ? (
            <ul className="hub-bridge-list">
              {story.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </article>
      ))}
    </div>
  );
}
