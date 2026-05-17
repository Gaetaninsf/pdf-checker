import express from "express";
import { healthHandler } from "./routes/health";
import { meHandler } from "./routes/me";
import { boxCheckHandler } from "./routes/box-check";

const app = express();
app.use(express.json());

app.get("/api/healthz", healthHandler);
app.get("/api/me", meHandler);
app.post("/api/box-check", boxCheckHandler);

const port = parseInt(process.env.PORT || process.env.APP_PORT || "8001", 10);
const host = process.env.APP_HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(
    JSON.stringify({
      event_type: "app.event",
      severity: "INFO",
      message: "api started",
      host,
      port,
    })
  );
});
