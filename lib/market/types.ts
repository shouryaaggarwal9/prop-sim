/** A single OHLC bar. `ticks` holds the intra-bar sub-prices that produced this
 *  bar (ticks[0] === open, ticks[last] === close) so the replay engine can play
 *  back the bar forming in real time instead of just snapping to the close. */
export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number[];
}
