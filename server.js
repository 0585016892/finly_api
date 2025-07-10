const express = require("express");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();
const app = express();
const { initSocket } = require("./sockets/notiSocket");
const { chatSocket, onlineUsers } = require("./sockets/chatSocket");
const { initAttendanceSocket } = require("./sockets/attendanceSocket");
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
// Middleware
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://quantri.vercel.app",
  "https://www.finlyshop.site", 
  "https://finlyshop.site"
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads")));
app.set("io", io);
// Import DB + Routes
const db = require("./db");
const userRoutes = require("./routes/user");
const productRoutes = require("./routes/product");
const danhmucRoutes = require("./routes/danhmuc");
const customerRoutes = require("./routes/customerRoutes");
const ordersRouter = require("./routes/order");
const couponRoutes = require("./routes/couponRoutes");
const slideRoutes = require("./routes/slideRoutes");
const footerRoutes = require("./routes/footerRoutes");
const chatRoutes = require("./routes/chatRoutes");
const authRoutes = require("./routes/authRoutes");
const employeesRoutes = require("./routes/employeesRoutes");
const rolesRoutes = require("./routes/rolesRoutes");
const reportsRoutes = require("./routes/reports");
const dashboardRoutes = require("./routes/dashboardRoutes");
const attendanceRoutes = require("./routes/attendance");
const chamcongRoutes = require("./routes/chamcongRoutes");
const sizeRoutes = require("./routes/sizeRoutes");
const colorRoutes = require("./routes/colorRoutes");
const faceRoutes = require("./routes/faceRoutes");
const autoReplyRoutes = require("./routes/autoReply");
const postRoutes = require("./routes/postRoutes");
const collectionRoutes = require("./routes/collectionRoutes");
// API Routes
app.use("/api/slides", slideRoutes);
app.use("/api/footer", footerRoutes);
app.use("/api/coupons", couponRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/orders", ordersRouter);
app.use("/api/products", productRoutes);
app.use("/api/categories", danhmucRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/employees", employeesRoutes);
app.use("/api/roles", rolesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/attendances", attendanceRoutes);
app.use("/api/chamcong", chamcongRoutes);
app.use("/api/size", sizeRoutes);
app.use("/api/colors", colorRoutes);
app.use("/api/face", faceRoutes);
app.use("/api/ai", autoReplyRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/collections", collectionRoutes);
app.get("/api/test", (req, res) => {
  res.send("✅ Backend hoạt động");
});
// Sử dụng socket chat
chatSocket(io);
app.set("onlineUsers", onlineUsers);
initSocket(io);
initAttendanceSocket(io);
// Khởi động server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server + Socket.IO đang chạy tại http://localhost:${PORT}`);
});
