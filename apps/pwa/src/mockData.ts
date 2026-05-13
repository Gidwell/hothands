export type Trader = {
  id: string;
  name: string;
  handle: string;
  avatar: string;
  role: string;
  streak: number;
  hotScore: number;
  roi: string;
  copied: number;
  signal: string;
  tableRead: string;
  tone: "gold" | "green" | "blue";
};

export type Spectator = {
  id: string;
  initials: string;
  color: string;
  mood: string;
};

export const market = {
  pair: "BTC-USD",
  price: "$102,480",
  move: "+2.4%",
  volume: "$1.8B 24h",
  status: "Live BTC market",
  expiry: "5m expiry",
  strike: "$102.5K strike",
};

export const spectators: Spectator[] = [
  { id: "s1", initials: "AO", color: "#f4b64f", mood: "copied" },
  { id: "s2", initials: "MK", color: "#62d68f", mood: "cheering" },
  { id: "s3", initials: "JR", color: "#6aa9ff", mood: "watching" },
  { id: "s4", initials: "VP", color: "#ef7d72", mood: "tailed" },
  { id: "s5", initials: "NL", color: "#b98cff", mood: "hot" },
  { id: "s6", initials: "QS", color: "#64d4d1", mood: "stacking" },
];

export const traders: Trader[] = [
  {
    id: "t1",
    name: "Mina Volt",
    handle: "@minav",
    avatar: "MV",
    role: "UP signal lead",
    streak: 8,
    hotScore: 96,
    roi: "+41.2%",
    copied: 1240,
    signal: "BTC UP on pullback",
    tableRead: "Clean entries, fast settlement",
    tone: "gold",
  },
  {
    id: "t2",
    name: "Kai Drift",
    handle: "@kaid",
    avatar: "KD",
    role: "DOWN tape scout",
    streak: 5,
    hotScore: 88,
    roi: "+24.8%",
    copied: 860,
    signal: "BTC DOWN into overheated wicks",
    tableRead: "Downside trigger, tight exits",
    tone: "green",
  },
  {
    id: "t3",
    name: "Rhea Stack",
    handle: "@rheas",
    avatar: "RS",
    role: "Expiry breakout lead",
    streak: 3,
    hotScore: 81,
    roi: "+18.6%",
    copied: 540,
    signal: "BTC UP on breakout close",
    tableRead: "Patient trigger, low noise",
    tone: "blue",
  },
];

export const copyTray = {
  state: "Armed",
  leader: "Mina Volt",
  market: "BTC-USD",
  maxCopy: "$250",
  settlement: "Next signal",
};
