const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { promisify } = require("util");
const nodemailer = require("nodemailer");
const query = promisify(db.query).bind(db);
const uploadAvatar = require("../middleware/uploadAvatar");

// Lấy danh sách nhân viên có tìm kiếm và phân trang
router.get(
  "/employees",
  authenticate,
  authorize(["admin", "manager"]),
  async (req, res) => {
    const { page = 1, limit = 10, search = "" } = req.query;
    const offset = (page - 1) * limit;
    const searchQuery = `%${search}%`;

    try {
      const employees = await query(
        `SELECT * FROM employees WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?`,
        [searchQuery, searchQuery, searchQuery, Number(limit), Number(offset)]
      );

      const countResult = await query(
        `SELECT COUNT(*) as total FROM employees WHERE full_name LIKE ? OR email LIKE ? OR phone LIKE ?`,
        [searchQuery, searchQuery, searchQuery]
      );

      res.json({
        data: employees,
        total: countResult[0].total,
        page: Number(page),
        limit: Number(limit),
      });
    } catch (err) {
      res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  }
);

// Thêm nhân viên
router.post(
  "/employees",
  authenticate,
  authorize(["admin"]),
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      const {
        full_name,
        email,
        phone,
        password,
        position,
        department,
        address,
        role,
        status,
        role_id,
      } = req.body;

      if (!full_name || !email || !password || !role) {
        return res
          .status(400)
          .json({ message: "Vui lòng điền đầy đủ thông tin bắt buộc." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const avatar = req.file ? `/uploads/avatars/${req.file.filename}` : null;

      const sql = `INSERT INTO employees (full_name, email, password, phone, position, department, address, role, status, avatar, created_at, updated_at, role_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`;

      const result = await query(sql, [
        full_name,
        email,
        hashedPassword,
        phone || null,
        position || null,
        department || null,
        address || null,
        role,
        status || "active",
        avatar,
        role_id || null,
      ]);

      res.json({
        message: "Tạo nhân viên thành công",
        id: result.insertId,
        avatar,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Lỗi xử lý", error: err.message });
    }
  }
);

// Cập nhật nhân viên
router.put(
  "/employees/:id",
  authenticate,
  authorize(["admin"]),
  uploadAvatar.single("avatar"),
  async (req, res) => {
    try {
      const {
        full_name,
        email,
        phone,
        position,
        department,
        address,
        role,
        status,
        password,
      } = req.body;

      let fields = [
        "full_name = ?",
        "email = ?",
        "phone = ?",
        "position = ?",
        "department = ?",
        "address = ?",
        "role = ?",
        "status = ?",
      ];
      let values = [
        full_name,
        email,
        phone,
        position,
        department,
        address,
        role,
        status,
      ];

      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        fields.push("password = ?");
        values.push(hashedPassword);
      }

      if (req.file) {
        const avatarPath = `/uploads/avatars/${req.file.filename}`;
        fields.push("avatar = ?");
        values.push(avatarPath);
      }

      fields.push("updated_at = NOW()");
      values.push(req.params.id);

      const sql = `UPDATE employees SET ${fields.join(", ")} WHERE id = ?`;
      await query(sql, values);

      res.json({ message: "Cập nhật nhân viên thành công" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi cập nhật", error: err.message });
    }
  }
);

// Xóa nhân viên
router.delete(
  "/employees/:id",
  authenticate,
  authorize(["admin"]),
  async (req, res) => {
    try {
      await query(`DELETE FROM employees WHERE id = ?`, [req.params.id]);
      res.json({ message: "Xóa nhân viên thành công" });
    } catch (err) {
      res.status(500).json({ message: "Lỗi xóa", error: err.message });
    }
  }
);

// Đổi mật khẩu
router.put("/change-password", authenticate, async (req, res) => {
  const userId = req.user.id;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Vui lòng nhập đầy đủ mật khẩu cũ và mật khẩu mới.",
      });
  }

  try {
    const rows = await query(
      "SELECT password, email, full_name FROM employees WHERE id = ?",
      [userId]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Tài khoản không tồn tại." });
    }

    const { password: hashedPassword, email, full_name } = rows[0];
    const isMatch = await bcrypt.compare(oldPassword, hashedPassword);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Mật khẩu cũ không chính xác." });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);
    await query("UPDATE employees SET password = ? WHERE id = ?", [
      newHashedPassword,
      userId,
    ]);

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

    const content = `Xin chào ${full_name},\n\nBạn đã đổi mật khẩu thành công vào lúc ${new Date().toLocaleString(
      "vi-VN"
    )}\nNếu bạn không thực hiện hành động này, vui lòng liên hệ bộ phận IT ngay lập tức.\n\nTrân trọng,\nPhòng Nhân sự`;

    await transporter.sendMail({
      from: `"HR Finly" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Xác nhận đổi mật khẩu",
      text: content,
    });

    res.json({ success: true, message: "Đổi mật khẩu thành công." });
  } catch (err) {
    console.error("Lỗi đổi mật khẩu:", err);
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

// Gửi OTP khôi phục mật khẩu
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;
  if (!email)
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng nhập email." });

  try {
    const [user] = await query("SELECT * FROM employees WHERE email = ?", [
      email,
    ]);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "Email không tồn tại." });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(
      "INSERT INTO password_resets (email, otp_code, expires_at) VALUES (?, ?, ?)",
      [email, otp, expiresAt]
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

    const content = `Mã OTP để đặt lại mật khẩu của bạn là: ${otp}\nOTP sẽ hết hạn sau 10 phút.`;
    await transporter.sendMail({
      from: `"HR Finly" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Khôi phục mật khẩu - Mã OTP",
      text: content,
    });

    res.json({ success: true, message: "Đã gửi mã OTP tới email." });
  } catch (err) {
    console.error("OTP error:", err);
    res.status(500).json({ success: false, message: "Lỗi gửi OTP" });
  }
});

// Đặt lại mật khẩu
router.put("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res
      .status(400)
      .json({ success: false, message: "Thiếu thông tin." });
  }

  try {
    const [reset] = await query(
      "SELECT * FROM password_resets WHERE email = ? AND otp_code = ? ORDER BY created_at DESC LIMIT 1",
      [email, otp]
    );

    if (!reset || new Date(reset.expires_at) < new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "OTP không hợp lệ hoặc đã hết hạn." });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await query("UPDATE employees SET password = ? WHERE email = ?", [
      hashed,
      email,
    ]);
    await query("DELETE FROM password_resets WHERE email = ?", [email]);

    res.json({ success: true, message: "Đặt lại mật khẩu thành công." });
  } catch (err) {
    res.status(500).json({ success: false, message: "Lỗi server." });
  }
});

module.exports = router;
