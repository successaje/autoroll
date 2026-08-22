import { clock, toNum } from "../lib/format";
import type { RollerEvent } from "../lib/types";

/** Plain-language event log. Win/loss carries a word as well as a colour —
 *  status hues never do the work alone. */
export function Feed({ feed, decimals }: { feed: RollerEvent[]; decimals: number }) {
  if (feed.length === 0) {
    return <p className="empty">Nothing yet. Open a position and the rolls will show up here.</p>;
  }

  return (
    <div className="feed">
      {[...feed].reverse().slice(0, 14).map((e, i) => (
        <div className="ev" key={`${e.at}-${i}`}>
          <time>{clock(e.at)}</time>
          {render(e, decimals)}
        </div>
      ))}
    </div>
  );
}

function render(e: RollerEvent, d: number) {
  switch (e.kind) {
    case "opened":
      return <span className="txt">Position opened.</span>;
    case "entered":
      return (
        <span className="txt">
          Entered <b>{e.symbol}</b> at <b>{e.price.toFixed(3)}</b> · {Math.round(e.secondsLeft)}s to expiry
        </span>
      );
    case "rolled": {
      const staked = toNum(e.staked, d).toFixed(2);
      const back = toNum(e.returned, d).toFixed(2);
      const bank = toNum(e.bankroll, d).toFixed(2);
      const tag = e.voided ? "void" : e.won ? "won" : "lost";
      return (
        <>
          <span className={`tag ${tag}`}>{e.voided ? "VOID" : e.won ? "WON" : "LOST"}</span>
          <span className="txt">
            staked {staked}, back {back} · bankroll <b>{bank}</b>
          </span>
        </>
      );
    }
    case "closed":
      return (
        <span className="txt">
          Stopped rolling — <b>{e.reason}</b>
        </span>
      );
    case "note":
      return <span className="txt">{e.text}</span>;
  }
}
