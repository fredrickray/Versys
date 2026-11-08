import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 10,
  duration: "20s",
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<800"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";
const SECRET = __ENV.WEBHOOK_SECRET || "";

export default function () {
  const headers = { "Content-Type": "application/json" };
  if (SECRET) headers["x-versys-webhook-secret"] = SECRET;

  const start = http.post(
    `${BASE}/v1/channels/ussd/session`,
    JSON.stringify({
      phoneE164: `+23480${String(10000000 + (__VU * 1000) + __ITER).slice(0, 8)}`,
      text: "",
    }),
    { headers },
  );
  check(start, { "ussd start": (r) => r.status === 200 || r.status === 201 });
  sleep(0.3);
}
