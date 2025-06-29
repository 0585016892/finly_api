const express = require("express");
const router = express.Router();
const db = require("../db");
const { verifyToken, hasPermission } = require("../middleware/auth.middleware");

// 📌 Lấy tất cả roles
router.get(
  "/roles",
  verifyToken,
  hasPermission("view_roles"),
  async (req, res) => {
    try {
      const [roles] = await db.promise().query("SELECT * FROM roles");
      res.json(roles);
    } catch (err) {
      console.error("Lỗi lấy danh sách roles:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);

// 📌 Lấy tất cả permissions
router.get(
  "/permissions",
  verifyToken,
  hasPermission("view_roles"),
  async (req, res) => {
    try {
      const [permissions] = await db
        .promise()
        .query("SELECT * FROM permissions");
      res.json(permissions);
    } catch (err) {
      console.error("Lỗi lấy danh sách permissions:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);

// 📌 Tạo role mới và gán quyền
router.post(
  "/roles",
  verifyToken,
  hasPermission("edit_users"),
  async (req, res) => {
    const { name, permissions } = req.body;

    try {
      const [result] = await db
        .promise()
        .query("INSERT INTO roles (name) VALUES (?)", [name]);
      const roleId = result.insertId;

      if (Array.isArray(permissions) && permissions.length > 0) {
        const values = permissions.map((p) => [roleId, p]);
        await db
          .promise()
          .query(
            "INSERT INTO role_permissions (role_id, permission_id) VALUES ?",
            [values]
          );
      }

      res.json({ message: "Tạo vai trò thành công" });
    } catch (err) {
      console.error("Lỗi tạo vai trò:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);

// 📌 Cập nhật role + quyền
router.put(
  "/roles/:id",
  verifyToken,
  hasPermission("edit_users"),
  async (req, res) => {
    const { name, permissions } = req.body;
    const roleId = req.params.id;

    try {
      // Cập nhật tên role
      await db
        .promise()
        .query("UPDATE roles SET name = ? WHERE id = ?", [name, roleId]);

      // Xoá tất cả quyền cũ
      await db
        .promise()
        .query("DELETE FROM role_permissions WHERE role_id = ?", [roleId]);

      // Gán lại quyền mới
      if (Array.isArray(permissions) && permissions.length > 0) {
        const values = permissions.map((p) => [roleId, p]);
        await db
          .promise()
          .query(
            "INSERT INTO role_permissions (role_id, permission_id) VALUES ?",
            [values]
          );
      }

      res.json({ message: "Cập nhật vai trò thành công" });
    } catch (err) {
      console.error("Lỗi cập nhật vai trò:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
);

module.exports = router;
