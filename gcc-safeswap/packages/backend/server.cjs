const express = require("express");
const cors = require("cors");
const app = express();

const allowedOrigins = [
  "https://gcc-me-vprotect.vercel.app",
  "http://localhost:5173"
];

app.use((req, _res, next) => { req.url = req.url.replace(/\/{2,}/g, "/"); next(); });
app.use(cors({ origin: allowedOrigins, methods: ["GET","POST"] }));
app.use(express.json());

// mount routes
app.use("/api/dex", require("./routes/dex"));
app.use("/api/price", require("./routes/price"));
app.use("/api/plugins", require("./routes/plugins"));

app.get("/", (_req,res)=>res.status(404).send("OK"));
module.exports = app;
