const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(express.json());

/* CORS CONFIG */
app.use(
  cors({
    origin: ["http://localhost:5173", "https://bambo-app.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

app.get("/", (req, res) => {
  res.send("Exam Practice Backend is live");
});

/* ROUTES */
const subjectRoutes  = require("./routes/subjectRoutes");
const topicRoutes    = require("./routes/topicRoutes");
const questionRoutes = require("./routes/questionRoutes");
const requestRoutes  = require("./routes/requestRoutes");
const authRoutes     = require("./routes/authRoutes");

app.use("/api/subjects", subjectRoutes);
app.use("/api/topics", topicRoutes);
app.use("/api/questions", questionRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/auth", authRoutes);

/* DB CONNECTION */
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err));

/* PORT FIX FOR RENDER */
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
