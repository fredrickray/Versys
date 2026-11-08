import ws from "k6/ws";
import { check, sleep } from "k6";

/**
 * Socket.IO is not raw WebSocket — this soak hits the HTTP polling transport
 * upgrade path. For full Socket.IO protocol tests use k6/x/socketio or a
 * dedicated harness. Here we verify the realtime process accepts connections.
 */
export const options = {
  vus: 25,
  duration: "20s",
  thresholds: {
    checks: ["rate>0.95"],
  },
};

const BASE = (__ENV.REALTIME_URL || "http://localhost:3001").replace(
  /^http/,
  "ws",
);

export default function () {
  // Socket.IO handshake probe via Engine.IO path
  const url = `${BASE}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, {}, function (socket) {
    socket.on("open", () => {
      socket.close();
    });
    socket.on("error", () => {
      socket.close();
    });
    sleep(1);
  });
  check(res, { connected: (r) => r && r.status === 101 });
}
