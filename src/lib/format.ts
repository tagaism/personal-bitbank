const NAMES: Record<string, string> = {
  jpy: "Japanese Yen",
  btc: "Bitcoin",
  xrp: "XRP",
  ltc: "Litecoin",
  eth: "Ethereum",
  mona: "Monacoin",
  bcc: "Bitcoin Cash",
  xlm: "Stellar",
  qtum: "Qtum",
  bat: "Basic Attention Token",
  omg: "OMG Network",
  xym: "Symbol",
  link: "Chainlink",
  mkr: "Maker",
  boba: "Boba Network",
  enj: "Enjin Coin",
  matic: "Polygon",
  pol: "Polygon",
  dot: "Polkadot",
  doge: "Dogecoin",
  astr: "Astar",
  ada: "Cardano",
  avax: "Avalanche",
  axs: "Axie Infinity",
  flr: "Flare",
  sand: "The Sandbox",
  gala: "Gala",
  ape: "ApeCoin",
  chz: "Chiliz",
  oas: "Oasys",
  mana: "Decentraland",
  grt: "The Graph",
  rndr: "Render",
  render: "Render",
  bnb: "BNB",
  dai: "Dai",
  op: "Optimism",
  arb: "Arbitrum",
  klay: "Klaytn",
  imx: "Immutable",
  mask: "Mask Network",
  sol: "Solana",
  cyber: "Cyber",
  trx: "TRON",
  lpt: "Livepeer",
  atom: "Cosmos",
  sui: "Sui",
  sky: "Sky",
};

export function assetName(asset: string): string {
  return NAMES[asset.toLowerCase()] ?? asset.toUpperCase();
}

export function formatQuantity(value: string, precision: number): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.max(precision, 0),
  }).format(number);
}

export function formatYen(value: string | null): string {
  if (value == null) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const abs = Math.abs(number);
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 2 : 4;
  return `¥${new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(number)}`;
}

export function formatTimestamp(ms: number | null): string {
  if (ms == null) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(ms));
}
