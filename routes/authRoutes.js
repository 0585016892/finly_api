const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// Helper function dùng query dạng Promise
const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

// ✅ Đăng nhập admin
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const users = await query(
      `SELECT * FROM employees WHERE email = ? AND status = 'active'`,
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Tài khoản không tồn tại" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Sai mật khẩu" });

    const perms = await query(
      `
      SELECT p.name FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `,
      [user.role_id]
    );

    const permissions = perms.map((p) => p.name);
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role_id,
        permissions,
      },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        position: user.position,
        department: user.department,
        address: user.address,
        status: user.status,
        created_at: user.created_at,
        role_id: user.role_id,
        role: user.role,
        permissions,
      },
    });
  } catch (err) {
    console.error("❌ Lỗi đăng nhập admin:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi đăng nhập" });
  }
});

// ✅ Đăng nhập người dùng (customer)
router.post("/user/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const users = await query(
      `SELECT * FROM customers WHERE email = ? AND status = 'active'`,
      [email]
    );

    if (users.length === 0) {
      return res
        .status(401)
        .json({ message: "Email không tồn tại hoặc đã bị khóa" });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Mật khẩu không chính xác" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password: _, ...userWithoutPassword } = user;

    res.json({
      token,
      user: userWithoutPassword,
    });
  } catch (err) {
    console.error("❌ Lỗi đăng nhập người dùng:", err);
    res.status(500).json({ message: "Lỗi hệ thống khi đăng nhập" });
  }
});

module.exports = router;
