import http from "k6/http";
import { check, sleep } from "k6";
import { Rate } from "k6/metrics";

const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    health_burst: {
      executor: "constant-arrival-rate",
      rate: 50,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
    errors: ["rate<0.01"],
  },
};

const BASE = __ENV.BASE_URL || "http://localhost:3000";

export default function () {
  const res = http.get(`${BASE}/v1/health`);
  const ok = check(res, { "health 200": (r) => r.status === 200 });
  errorRate.add(!ok);
  sleep(0.05);
}
