const express = require("express");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

const port = 3000;
app.listen(port, () => {
  console.log(`API disponible sur http://localhost:${port}`);
});