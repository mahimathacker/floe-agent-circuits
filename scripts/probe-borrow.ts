import { getFloeAuthHeaders } from "../shared/auth.js";

const headers = await getFloeAuthHeaders("circuit-2");
const res = await fetch(
  "https://credit-api.floelabs.xyz/v1/credit/instant-borrow",
  {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      marketId:
        "0xfe92656527bae8e6d37a9e0bb785383fbb33f1f0c7e29fdd733f5af7390c2930",
      borrowAmount: "5000000",
      collateralAmount: "20000000000000000",
      maxInterestRateBps: "1500",
      duration: "2592000",
      minLtvBps: "1000",
    }),
  },
);
console.log("Status:", res.status);
console.log(JSON.stringify(await res.json(), null, 2));
