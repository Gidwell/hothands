export type Trader = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  streak: number;
  roi: string;
  copied: number;
  signal: string;
  tone: "gold" | "green" | "blue";
};

export type Spectator = {
  id: string;
  initials: string;
  color: string;
};

export const market = {
  pair: "BTC-USD",
  price: "$102,480",
  move: "+2.4%",
  volume: "$1.8B 24h",
  status: "Live table",
};

export const spectators: Spectator[] = [
  { id: "s1", initials: "AO", color: "#f4b64f" },
  { id: "s2", initials: "MK", color: "#62d68f" },
  { id: "s3", initials: "JR", color: "#6aa9ff" },
  { id: "s4", initials: "VP", color: "#ef7d72" },
  { id: "s5", initials: "NL", color: "#b98cff" },
  { id: "s6", initials: "QS", color: "#64d4d1" },
];

export const traders: Trader[] = [
  {
    id: "t1",
    name: "Mina Volt",
    handle: "@minav",
    avatar: "MV",
    streak: 8,
    roi: "+41.2%",
    copied: 1240,
    signal: "Long BTC on pullback",
    tone: "gold",
  },
  {
    id: "t2",
    name: "Kai Drift",
    handle: "@kaid",
    avatar: "KD",
    streak: 5,
    roi: "+24.8%",
    copied: 860,
    signal: "Fade overheated wicks",
    tone: "green",
  },
  {
    id: "t3",
    name: "Rhea Stack",
    handle: "@rheas",
    avatar: "RS",
    streak: 3,
    roi: "+18.6%",
    copied: 540,
    signal: "Wait for breakout close",
    tone: "blue",
  },
];

export const copyTray = {
  state: "Armed",
  leader: "Mina Volt",
  market: "BTC-USD",
  maxStake: "$250",
  settlement: "Next signal",
};
