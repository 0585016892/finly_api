const express = require("express");
const router = express.Router();
const db = require("../db");
const upload = require("../middleware/upload");
const path = require("path");
const { emitAttendanceToUser } = require("../sockets/attendanceSocket");

// ✅ API 1: Lấy danh sách labels từ bảng employees
router.get("/labels", async (req, res) => {
  try {
    const [results] = await db.query(
      "SELECT id, full_name, avatar FROM employees"
    );

    const labels = results.map((emp) => ({
      id: emp.id,
      label: emp.full_name,
      avatar: emp.avatar,
    }));

    res.json(labels);
  } catch (err) {
    res.status(500).json({ error: "Không thể lấy dữ liệu" });
  }
});

// === CHECK-IN ===
router.post("/attendance", upload.single("img_checkin"), async (req, res) => {
  const user_id = req.body.user_id;
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const vnOffset = 7 * 60 * 60 * 1000;
  const vnNow = new Date(now.getTime() + vnOffset);
  const today = vnNow.toISOString().split("T")[0];

  if (!user_id || !req.file) {
    return res.status(400).json({ error: "Thiếu dữ liệu (user_id hoặc ảnh)" });
  }

  const img_checkin = `/uploads/checkin/${req.file.filename}`;

  try {
    const [rows] = await db.query(
      "SELECT * FROM attendances WHERE user_id = ? AND work_date = ?",
      [user_id, today]
    );

    if (rows.length === 0) {
      let status = "on-time";
      if (hour > 8 || (hour === 8 && minute > 30)) {
        status = "late";
      }

      await db.promise().query("INSERT INTO attendances SET ?", {
        user_id,
        work_date: today,
        check_in_time: now,
        img_checkin,
        status,
      });

      emitAttendanceToUser(user_id, {
        time: now,
        img: img_checkin,
        status: "checked-in",
      });

      return res.json({
        status: "checked-in",
        time: now,
        img: img_checkin,
      });
    } else {
      return res.json({
        status: "already checked-in",
        time: rows[0].check_in_time,
        img: rows[0].img_checkin,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: "Lỗi truy vấn DB" });
  }
});

// === CHECK-OUT ===
router.post("/checkout", upload.single("img_checkout"), async (req, res) => {
  const user_id = req.body.user_id;
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  if (!user_id || !req.file) {
    return res.status(400).json({ error: "Thiếu user_id hoặc ảnh" });
  }

  const img_checkout = `/uploads/checkout/${req.file.filename}`;

  try {
    const [rows] = await db.query(
      "SELECT * FROM attendances WHERE user_id = ? AND work_date = ?",
      [user_id, today]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: "Chưa check-in hôm nay" });
    }

    const row = rows[0];
    if (row.check_out_time) {
      return res.json({
        status: "already checked-out",
        time: row.check_out_time,
      });
    }

    await db.query(
      "UPDATE attendances SET check_out_time = ?, img_checkout = ? WHERE id = ?",
      [now, img_checkout, row.id]
    );

    return res.json({ status: "checked-out", time: now });
  } catch (err) {
    return res.status(500).json({ error: "Lỗi cập nhật checkout" });
  }
});

module.exports = router;
