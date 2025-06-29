const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");
const moment = require("moment");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

router.get("/", async (req, res) => {
  const { user_id, work_date } = req.query;

  if (!user_id)
    return res.status(400).json({ success: false, message: "Thiếu user_id" });

  try {
    let sql = "SELECT * FROM attendances WHERE user_id = ?";
    let params = [user_id];

    if (work_date) {
      sql += " AND DATE(work_date) = ?";
      params.push(work_date);
    }

    const results = await query(sql, params);
    res.json(results);
  } catch (err) {
    console.error("Lỗi SQL:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi truy vấn", error: err });
  }
});

router.get("/month", async (req, res) => {
  const user_id = Number(req.query.user_id);
  const year = Number(req.query.year);
  const month = Number(req.query.month);

  if (!user_id || !year || !month) {
    return res
      .status(400)
      .json({ message: "Thiếu user_id hoặc year hoặc month" });
  }

  try {
    const lastDay = new Date(year, month, 0).getDate();
    const monthStr = month.toString().padStart(2, "0");
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-${lastDay
      .toString()
      .padStart(2, "0")}`;

    const results = await query(
      `SELECT DISTINCT DATE(work_date) AS day FROM attendances WHERE user_id = ? AND work_date BETWEEN ? AND ?`,
      [user_id, startDate, endDate]
    );

    const days = results.map((r) => r.day.toISOString().split("T")[0]);
    res.json(days);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Lỗi truy vấn" });
  }
});

function calculateWorkHours(checkIn, checkOut) {
  const inTime = moment(checkIn);
  const outTime = moment(checkOut);

  const noonStart = moment(inTime).hour(12).minute(0);
  const noonEnd = moment(inTime).hour(13).minute(0);

  let duration = moment.duration(outTime.diff(inTime));
  let totalMinutes = duration.asMinutes();

  if (inTime.isBefore(noonEnd) && outTime.isAfter(noonStart)) {
    totalMinutes -= 60;
  }

  return parseFloat((totalMinutes / 60).toFixed(2));
}

router.get("/salary", async (req, res) => {
  const user_id = Number(req.query.user_id);
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  const salaryPerDay = 300000;
  const overtimeRate = 50000;

  if (!user_id || !year || !month) {
    return res
      .status(400)
      .json({ message: "Thiếu user_id hoặc year hoặc month" });
  }

  try {
    const lastDay = new Date(year, month, 0).getDate();
    const monthStr = month.toString().padStart(2, "0");
    const startDate = `${year}-${monthStr}-01`;
    const endDate = `${year}-${monthStr}-${lastDay
      .toString()
      .padStart(2, "0")}`;

    const rows = await query(
      `SELECT * FROM attendances WHERE user_id = ? AND work_date BETWEEN ? AND ?`,
      [user_id, startDate, endDate]
    );

    let tongGio = 0,
      soNgayCong = 0,
      soLanTre = 0,
      soLanVeSom = 0,
      tongGioTangCa = 0;

    rows.forEach((r) => {
      if (!r.check_in_time || !r.check_out_time) return;

      const workHours = calculateWorkHours(r.check_in_time, r.check_out_time);
      tongGio += workHours;

      const checkIn = moment(r.check_in_time);
      const checkOut = moment(r.check_out_time);

      if (checkIn.isAfter(moment(checkIn).hour(8).minute(30))) soLanTre++;
      if (checkOut.isBefore(moment(checkOut).hour(17).minute(30))) soLanVeSom++;
      if (workHours > 8) tongGioTangCa += workHours - 8;

      soNgayCong++;
    });

    const luongNgay = soNgayCong * salaryPerDay;
    const luongTangCa = tongGioTangCa * overtimeRate;
    const tongLuong = luongNgay + luongTangCa;

    res.json({
      soNgayCong,
      tongGio: tongGio.toFixed(2),
      soLanTre,
      soLanVeSom,
      tongGioTangCa: tongGioTangCa.toFixed(2),
      luongNgay,
      luongTangCa,
      tongLuong,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi truy vấn", err });
  }
});

router.post("/save", async (req, res) => {
  const {
    user_id,
    full_name,
    email,
    year,
    month,
    soNgayCong,
    tongGio,
    soLanTre,
    soLanVeSom,
    tongGioTangCa,
    luongNgay,
    luongTangCa,
    tongLuong,
  } = req.body;

  if (!user_id || !year || !month) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu thông tin bắt buộc" });
  }

  try {
    await query(
      `INSERT INTO salaries (
        user_id, year, month, soNgayCong, tongGio, soLanTre, soLanVeSom,
        tongGioTangCa, luongNgay, luongTangCa, tongLuong
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        soNgayCong = VALUES(soNgayCong),
        tongGio = VALUES(tongGio),
        soLanTre = VALUES(soLanTre),
        soLanVeSom = VALUES(soLanVeSom),
        tongGioTangCa = VALUES(tongGioTangCa),
        luongNgay = VALUES(luongNgay),
        luongTangCa = VALUES(luongTangCa),
        tongLuong = VALUES(tongLuong)`,
      [
        user_id,
        year,
        month,
        soNgayCong,
        tongGio,
        soLanTre,
        soLanVeSom,
        tongGioTangCa,
        luongNgay,
        luongTangCa,
        tongLuong,
      ]
    );

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      tls: { rejectUnauthorized: false },
    });

    const content = `
      Xin chào ${full_name},

      Đây là bảng lương của bạn trong tháng ${month}/${year}:

      - Ngày công: ${soNgayCong} ngày
      - Tổng giờ làm: ${tongGio} giờ
      - Số lần đi trễ: ${soLanTre}
      - Số lần về sớm: ${soLanVeSom}
      - Giờ tăng ca: ${tongGioTangCa} giờ

      - Lương chính: ${Number(luongNgay).toLocaleString("vi-VN")} đ
      - Lương tăng ca: ${Number(luongTangCa).toLocaleString("vi-VN")} đ
      - 👉 Tổng lương: ${Number(tongLuong).toLocaleString("vi-VN")} đ

      Trân trọng,
      Phòng Nhân sự
    `.trim();

    await transporter.sendMail({
      from: `"HR Finly" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Bảng lương tháng ${month}/${year} của bạn`,
      text: content,
    });

    res.json({ success: true, message: "Lưu và gửi email lương thành công" });
  } catch (err) {
    console.error("❌ Lỗi lưu/gửi email:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi khi lưu hoặc gửi mail",
      error: err.message,
    });
  }
});

router.get("/check", async (req, res) => {
  const { user_id, year, month } = req.query;

  if (!user_id || !year || !month) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu thông tin kiểm tra" });
  }

  try {
    const rows = await query(
      `SELECT id FROM salaries WHERE user_id = ? AND year = ? AND month = ? LIMIT 1`,
      [user_id, year, month]
    );

    return res.json({ saved: rows.length > 0 });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Lỗi kiểm tra" });
  }
});

module.exports = router;
