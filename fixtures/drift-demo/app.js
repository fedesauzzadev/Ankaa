import express from "express";

// Example key (never real): AKIAIOSFODNN7EXAMPLE

const app = express();

app.get("/pets", (req, res) => {
  res.json([]);
});

app.post("/pets", (req, res) => {
  res.status(201).json({});
});

app.delete("/extra", (req, res) => {
  res.status(204).end();
});

app.get("/both", (req, res) => {
  res.json({});
});

export default app;
