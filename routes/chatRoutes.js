const express = require("express");
const router = express.Router();
const db = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { imageHash } = require("image-hash");
const hamming = require("hamming-distance");
const { promisify } = require("util");
const URL = process.env.URL_WEB;

const dbQuery = promisify(db.query).bind(db);
const imageHashAsync = promisify(imageHash);

const storage = multer.diskStorage({
  destination: "public/uploads/chat",
  filename: (req, file, cb) => {
    const filename = Date.now() + "_" + file.originalname;
    cb(null, filename);
  },
});
const upload = multer({ storage });

// [1] Lấy danh sách người dùng đã chat với admin
router.get("/", async (req, res) => {
  try {
    const sql = `
      SELECT DISTINCT 
        IF(cm.sender = 'admin', cm.receiver, cm.sender) AS userId,
        u.full_name
      FROM chat_messages cm
      JOIN customers u ON u.id = IF(cm.sender = 'admin', cm.receiver, cm.sender)
      WHERE cm.sender = 'admin' OR cm.receiver = 'admin'
    `;
    const results = await dbQuery(sql);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// [2] Lấy tất cả tin nhắn giữa user và admin
router.get("/conversation/:userId", async (req, res) => {
  const userId = req.params.userId;
  try {
    const sql = `
      SELECT * FROM chat_messages
      WHERE (sender = 'admin' AND receiver = ?)
        OR (sender = ? AND receiver = 'admin')
        OR (sender = 'bot' AND receiver = ?)
      ORDER BY created_at ASC
    `;
    const results = await dbQuery(sql, [userId, userId, userId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: "Lỗi truy vấn", error: err });
  }
});

// [3] Bot trả lời theo keyword
router.post("/bot-reply", async (req, res) => {
  const { message } = req.body;
  if (!message)
    return res.status(400).json({ error: "Thiếu nội dung câu hỏi." });

  try {
    const sql = `SELECT reply FROM chatbot_replies WHERE ? LIKE CONCAT('%', keyword, '%') LIMIT 1`;
    const results = await dbQuery(sql, [message.toLowerCase()]);

    if (results.length > 0) res.json({ reply: results[0].reply });
    else res.json({ reply: "Xin lỗi, tôi chưa hiểu câu hỏi của bạn." });
  } catch (err) {
    res.status(500).json({ error: "Lỗi truy vấn DB." });
  }
});

function getHash(imagePath) {
  return imageHashAsync(imagePath, 8, true);
}

// [4] Upload ảnh và gợi ý sản phẩm theo ảnh
router.post("/upload-image", upload.single("image"), async (req, res) => {
  if (!req.file)
    return res.status(400).json({ success: false, message: "No file" });

  const imageUrl = `${URL}/uploads/chat/${req.file.filename}`;
  const io = req.app.get("io");
  const onlineUsers = req.app.get("onlineUsers");
  const sender = req.body.sender;

  try {
    const userMessage = {
      sender,
      receiver: "admin",
      content: "Sản phẩm này còn hàng không?",
      image: imageUrl,
      timestamp: Date.now(),
    };

    const senderSockets = onlineUsers.get(sender);
    if (senderSockets)
      senderSockets.forEach((socketId) =>
        io.to(socketId).emit("receive_private_message", userMessage)
      );
    const adminSockets = onlineUsers.get("admin");
    if (adminSockets)
      adminSockets.forEach((socketId) =>
        io.to(socketId).emit("receive_private_message", userMessage)
      );

    await dbQuery(
      "INSERT INTO chat_messages (sender, receiver, content, image) VALUES (?, ?, ?, ?)",
      [
        userMessage.sender,
        userMessage.receiver,
        userMessage.content,
        userMessage.image || null,
      ]
    );

    const userHash = await getHash(req.file.path);
    const products = await dbQuery("SELECT * FROM sanpham");

    let closest = null;
    let minDistance = Infinity;

    for (const product of products) {
      const relativePath = product.image.replace(`${URL}/`, "");
      const imagePath = path.join(
        __dirname,
        "..",
        "public",
        "uploads",
        relativePath
      );
      if (!fs.existsSync(imagePath)) continue;

      try {
        const prodHash = await getHash(imagePath);
        const distance = hamming(userHash, prodHash);
        if (distance < minDistance) {
          minDistance = distance;
          closest = product;
        }
      } catch (hashErr) {
        console.error("Hash error:", hashErr);
      }
    }

    const MAX_HASH_DISTANCE = 15;
    if (closest && minDistance <= MAX_HASH_DISTANCE) {
      const botReply = {
        sender: "bot",
        receiver: sender,
        content: `🔍 Có phải bạn đang tìm sản phẩm \"${closest.name}\"?\n👉 Xem tại: https://finlyapi-production.up.railway.app/product/${closest.slug}`,
        image: `${URL}/uploads/${closest.image}`,
        product: {
          id: closest.id,
          name: closest.name,
          image: closest.image,
          slug: closest.slug,
          price: closest.price,
          sizes: closest.size?.split(",") || [],
          colors: closest.color?.split(",") || [],
        },
        timestamp: Date.now(),
      };

      await dbQuery(
        "INSERT INTO chat_messages (sender, receiver, content, image) VALUES (?, ?, ?, ?)",
        [botReply.sender, botReply.receiver, botReply.content, botReply.image]
      );

      if (senderSockets)
        senderSockets.forEach((socketId) =>
          io.to(socketId).emit("receive_private_message", botReply)
        );
      console.log("🤖 Bot đã gửi gợi ý sản phẩm:", closest.name);
    } else {
      console.log("❌ Không có sản phẩm đủ giống để gợi ý.");
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Lỗi xử lý ảnh:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
