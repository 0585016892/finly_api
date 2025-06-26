const express = require("express");
const router = express.Router();
const db = require("../db");

// [1] Lấy danh sách người dùng đã chat với admin
router.get("/", (req, res) => {
  console.log("Nhận yêu cầu GET /api/chat");

  const sql = `
     SELECT DISTINCT 
      IF(cm.sender = 'admin', cm.receiver, cm.sender) AS userId,
      u.full_name
    FROM chat_messages cm
    JOIN customers u ON u.id = IF(cm.sender = 'admin', cm.receiver, cm.sender)
    WHERE cm.sender = 'admin' OR cm.receiver = 'admin'
    
  `;

  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results); // [{ userId: '102', full_name: 'Nguyễn Văn A' }, ...]
  });
});

// [2] Lấy tất cả tin nhắn giữa user và admin
router.get("/conversation/:userId", (req, res) => {
  const userId = req.params.userId;
  const sql = `
    SELECT * FROM chat_messages
    WHERE (sender = ? AND receiver = 'admin')
       OR (sender = 'admin' AND receiver = ?)
    ORDER BY created_at ASC
  `;

  db.query(sql, [userId, userId], (err, results) => {
    if (err)
      return res.status(500).json({ message: "Lỗi truy vấn", error: err });
    res.json(results);
  });
});

module.exports = router;
