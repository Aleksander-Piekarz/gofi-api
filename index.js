const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { pool } = require("./lib/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Statyczne pliki - obrazy ćwiczeń
app.use('/images', express.static(path.join(__dirname, 'public/images'), {
  maxAge: '7d',
  etag: true
}));

app.use('/api/exercises', require('./routes/exercises'));


app.use((req, _res, next) => { console.log(`${req.method} ${req.url}`); next(); });


app.get("/health", (_req, res) => res.send("ok"));


app.use("/api/users", userRoutes);

app.use('/api/log', require('./routes/log'));
app.use('/api/workout', require('./routes/session'));


app.use('/api/auth', require('./routes/auth'));
app.use('/api/questionnaire', require('./routes/questionnaire'));
app.use('/api/app-version', require('./routes/appVersion'));
app.get("/", (req, res) => {
  res.json({ message: "GoFi API is running", version: "test-branch" });
});


app.use((req, res) => {
  res.status(404).json({error:'Not found', method:req.method, url:req.originalUrl});
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://91.123.188.186:${port}`);
});
