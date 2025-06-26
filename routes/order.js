const express = require("express");
const router = express.Router();
const db = require("../db");
const nodemailer = require("nodemailer");
const { notifyNewOrder } = require("../sockets/notiSocket");
const { createVnpayUrl } = require("../utils/vnpay");
const bcrypt = require("bcrypt");
const qs = require("qs");
const crypto = require("crypto");
const moment = require("moment");
require("dotenv").config();
const generateRandomPassword = () => {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: 8 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
};

async function sendOrderEmails({
  orderId,
  customer,
  email,
  phone,
  address,
  note,
  paymentMethod,
  total,
  discount,
  shipping,
  final_total,
  items,
  plainPassword = null,
}) {
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

  const itemsList = items
    .map(
      (i) =>
        `- ${i.name} (Size: ${i.size}, Màu: ${i.color})\n` +
        `  Số lượng: ${i.quantity}\n` +
        `  Đơn giá: ${Number(i.price).toLocaleString("vi-VN")}đ\n` +
        `  Thành tiền: ${(i.price * i.quantity).toLocaleString("vi-VN")}đ`
    )
    .join("\n\n");

  const customerMail = {
    from: `"Finly" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Xác nhận đơn hàng #${orderId}`,
    text: `
Xin chào ${customer},

Cảm ơn bạn đã đặt hàng tại Finly. Đây là thông tin đơn hàng của bạn:

- Mã đơn hàng: #${orderId}
- Họ tên: ${customer}
- Điện thoại: ${phone}
- Địa chỉ: ${address}
- Ghi chú: ${note}
- Phương thức thanh toán: ${paymentMethod}
- Tổng tiền: ${Number(total).toLocaleString("vi-VN")} đ
- Giảm giá: ${Number(discount).toLocaleString("vi-VN")} đ
- Phí vận chuyển: ${Number(shipping).toLocaleString("vi-VN")} đ
- Tổng thanh toán: ${Number(final_total).toLocaleString("vi-VN")} đ

Chi tiết sản phẩm:

${itemsList}
${
  plainPassword
    ? `\n\nTài khoản của bạn đã được tạo tự động:\nEmail: ${email}\nMật khẩu: ${plainPassword}\nHãy đăng nhập và đổi mật khẩu sau lần đầu tiên.`
    : ""
}
Cảm ơn bạn đã mua sắm tại Finly. Chúng tôi sẽ xử lý đơn hàng của bạn ngay lập tức và thông báo khi vận chuyển.

Trân trọng,
Finly Team
    `.trim(),
  };

  const merchantMail = {
    from: `"Finly" <${process.env.EMAIL_USER}>`,
    to: "tranhung6829@gmail.com",
    subject: `[MỚI - VNPAY] Đơn hàng #${orderId} từ ${customer}`,
    text: `
Bạn có một đơn hàng mới (VNPAY):

- Mã đơn hàng: #${orderId}
- Tên KH: ${customer}
- SĐT: ${phone}
- Địa chỉ: ${address}
- Ghi chú: ${note}
- Phương thức thanh toán: ${paymentMethod}
- Tổng tiền: ${Number(total).toLocaleString("vi-VN")} đ
- Giảm giá: ${Number(discount).toLocaleString("vi-VN")} đ
- Vận chuyển: ${Number(shipping).toLocaleString("vi-VN")} đ
- Tổng thanh toán: ${Number(final_total).toLocaleString("vi-VN")} đ

Chi tiết:

${itemsList}

Finly Team
    `.trim(),
  };

  await transporter.sendMail(customerMail);
  await transporter.sendMail(merchantMail);
}

router.post("/add", (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_email,
    address,
    note,
    total,
    discount,
    shipping,
    final_total,
    payment_method,
    status,
    items,
  } = req.body;

  const checkEmailSql = "SELECT * FROM customers WHERE email = ?";
  db.query(checkEmailSql, [customer_email], (emailErr, emailResult) => {
    if (emailErr) {
      return res.status(500).json({
        success: false,
        message: "Lỗi kiểm tra email",
        error: emailErr.message,
      });
    }

    const processOrder = (customerId, plainPassword = null) => {
      db.beginTransaction((beginErr) => {
        if (beginErr) {
          return res.status(500).json({
            success: false,
            message: "Lỗi khi bắt đầu transaction",
            error: beginErr.message,
          });
        }

        const orderSql = `
          INSERT INTO orders (customer_name, customer_phone, customer_email, address, note,
            total, discount, shipping, final_total, payment_method, status, customer_id,coupon_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        db.query(
          orderSql,
          [
            customer_name,
            customer_phone,
            customer_email,
            address,
            note,
            total,
            discount,
            shipping,
            final_total,
            payment_method,
            status,
            customerId,
            (coupon_id = null), // thêm ở đây
          ],
          (orderErr, orderResult) => {
            if (orderErr) {
              return db.rollback(() =>
                res.status(500).json({
                  success: false,
                  message: "Lỗi lưu đơn hàng",
                  error: orderErr.message,
                })
              );
            }

            const orderId = orderResult.insertId;
            const insertItem = (item) =>
              new Promise((resolve, reject) => {
                const { product_id, quantity, price, size, color } = item;
                const insertSql = `
      INSERT INTO order_items (order_id, product_id, quantity, price, size, color)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
                db.query(
                  insertSql,
                  [orderId, product_id, quantity, price, size, color],
                  (itemErr) => {
                    if (itemErr) return reject(itemErr);

                    // ✅ Trừ số lượng sản phẩm trong bảng `sanpham`
                    const updateStockSql = `
                        UPDATE sanpham
                        SET quantity = quantity - ?
                        WHERE id = ? AND quantity >= ?
                      `;
                    db.query(
                      updateStockSql,
                      [quantity, product_id, quantity],
                      (stockErr, stockResult) => {
                        if (stockErr) return reject(stockErr);

                        if (stockResult.affectedRows === 0) {
                          return reject(
                            new Error(
                              `Sản phẩm ID ${product_id} không đủ hàng tồn`
                            )
                          );
                        }

                        resolve(); // Thành công cả 2 bước
                      }
                    );
                  }
                );
              });

            Promise.all(items.map(insertItem))
              .then(() => {
                db.commit((commitErr) => {
                  if (commitErr) {
                    return db.rollback(() =>
                      res.status(500).json({
                        success: false,
                        message: "Lỗi khi commit",
                        error: commitErr.message,
                      })
                    );
                  }
                  // --- Gửi thông báo realtime đơn hàng mới ---
                  notifyNewOrder({
                    id: orderId,
                    customer: customer_name,
                    total: final_total,
                  });
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

                  const itemsList = items
                    .map(
                      (i) =>
                        `- ${i.name} (Size: ${i.size}, Màu: ${i.color})\n` +
                        `  Số lượng: ${i.quantity}\n` +
                        `  Đơn giá: ${Number(i.price).toLocaleString(
                          "vi-VN"
                        )}đ\n` +
                        `  Thành tiền: ${(i.price * i.quantity).toLocaleString(
                          "vi-VN"
                        )}đ`
                    )
                    .join("\n\n");

                  const customerMail = {
                    from: `"Finly" <${process.env.EMAIL_USER}>`,
                    to: customer_email,
                    subject: `Xác nhận đơn hàng #${orderId}`,
                    text: `
                        Xin chào ${customer_name},

                        Cảm ơn bạn đã đặt hàng tại Finly. Đây là thông tin đơn hàng của bạn:

                        - Mã đơn hàng: #${orderId}
                        - Họ tên: ${customer_name}
                        - Điện thoại: ${customer_phone}
                        - Địa chỉ: ${address}
                        - Ghi chú: ${note}
                        - Phương thức thanh toán: ${payment_method}
                        - Tổng tiền: ${total.toLocaleString("vi-VN")} đ
                        - Giảm giá: ${discount.toLocaleString("vi-VN")} đ
                        - Phí vận chuyển: ${shipping.toLocaleString("vi-VN")} đ
                        - Tổng thanh toán: ${final_total.toLocaleString(
                          "vi-VN"
                        )} đ

                        Chi tiết sản phẩm:

                        ${itemsList}
                          ${
                            plainPassword
                              ? `\n\nTài khoản của bạn đã được tạo tự động:\nEmail: ${customer_email}\nMật khẩu: ${plainPassword}\nHãy đăng nhập và đổi mật khẩu sau lần đầu tiên.`
                              : ""
                          }
                        Cảm ơn bạn đã mua sắm tại Finly. Chúng tôi sẽ xử lý đơn hàng của bạn ngay lập tức và thông báo khi vận chuyển.

                        Trân trọng,
                        Finly Team
                    `.trim(),
                  };

                  const merchantMail = {
                    from: `"Finly" <${process.env.EMAIL_USER}>`,
                    to: "tranhung6829@gmail.com",
                    subject: `[MỚI] Đơn hàng #${orderId} từ ${customer_name}`,
                    text: `
Bạn có một đơn hàng mới:

- Mã đơn hàng: #${orderId}
- Tên KH: ${customer_name}
- SĐT: ${customer_phone}
- Địa chỉ: ${address}
- Ghi chú: ${note}
- Phương thức thanh toán: ${payment_method}
- Tổng tiền: ${total.toLocaleString("vi-VN")} đ
- Giảm giá: ${discount.toLocaleString("vi-VN")} đ
- Vận chuyển: ${shipping.toLocaleString("vi-VN")} đ
- Tổng thanh toán: ${final_total.toLocaleString("vi-VN")} đ

Chi tiết:

${itemsList}

Xử lý đơn hàng ngay nhé.

Finly Team
                    `.trim(),
                  };

                  transporter.sendMail(customerMail, () => {
                    transporter.sendMail(merchantMail, () => {
                      res.status(201).json({
                        success: true,
                        message: "Đơn hàng đã tạo và email đã được gửi.",
                        orderId,
                      });
                    });
                  });
                });
              })
              .catch((itemErr) => {
                db.rollback(() => {
                  res.status(500).json({
                    success: false,
                    message: "Lỗi lưu chi tiết sản phẩm",
                    error: itemErr.message,
                  });
                });
              });
          }
        );
      });
    };

    if (emailResult.length > 0) {
      const updateSql = `
        UPDATE customers SET full_name = ?, phone = ?, address = ?, status = ? WHERE email = ?
      `;
      db.query(
        updateSql,
        [customer_name, customer_phone, address, "active", customer_email],
        (updateErr) => {
          if (updateErr) {
            return res.status(500).json({
              success: false,
              message: "Lỗi cập nhật khách hàng",
              error: updateErr.message,
            });
          }
          processOrder(emailResult[0].id, null);
        }
      );
    } else {
      const plainPassword = generateRandomPassword();
      const hashedPassword = bcrypt.hashSync(plainPassword, 10);
      const insertSql = `
        INSERT INTO customers (full_name, phone, email, address, status,password) VALUES (?, ?, ?, ?, ?, ?)
      `;
      db.query(
        insertSql,
        [
          customer_name,
          customer_phone,
          customer_email,
          address,
          "active",
          hashedPassword,
        ],
        (custErr, custResult) => {
          if (custErr) {
            return res.status(500).json({
              success: false,
              message: "Lỗi thêm khách hàng",
              error: custErr.message,
            });
          }
          processOrder(custResult.insertId, plainPassword);
        }
      );
    }
  });
});

// Lấy danh sách đơn hàng
router.get("/", (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 8;
  const offset = (page - 1) * limit;

  const keyword = req.query.keyword || "";
  const status = req.query.status || "";

  // Dùng điều kiện động
  let whereClause = "WHERE 1=1";
  let params = [];

  if (keyword) {
    whereClause += ` AND (o.customer_name LIKE ? OR o.customer_email LIKE ? OR o.customer_phone LIKE ?)`;
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }

  if (status) {
    whereClause += ` AND o.status = ?`;
    params.push(status);
  }

  // 1. Truy vấn tổng số đơn hàng (với điều kiện lọc)
  const countSql = `SELECT COUNT(*) AS total FROM orders o ${whereClause}`;
  db.query(countSql, params, (countErr, countResult) => {
    if (countErr) {
      console.error("Lỗi truy vấn tổng đơn hàng:", countErr);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi truy vấn tổng đơn hàng",
        error: countErr.message,
      });
    }

    const totalOrders = countResult[0].total;
    const totalPages = Math.ceil(totalOrders / limit);

    // 2. Truy vấn đơn hàng có lọc + phân trang
    const orderSql = `
      SELECT 
        o.id AS order_id,
        o.customer_name,
        o.customer_phone,
        o.customer_email,
        o.address,
        o.note,
        o.total,
        o.discount,
        o.shipping,
        o.final_total,
        o.payment_method,
        o.status,
        o.created_at
      FROM orders o
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const orderParams = [...params, limit, offset];

    db.query(orderSql, orderParams, (orderErr, orders) => {
      if (orderErr) {
        console.error("Lỗi truy vấn đơn hàng:", orderErr);
        return res.status(500).json({
          success: false,
          message: "Lỗi khi truy vấn đơn hàng",
          error: orderErr.message,
        });
      }

      if (orders.length === 0) {
        return res.json({
          orders: [],
          totalOrders,
          totalPages,
          currentPage: page,
        });
      }

      // 3. Truy vấn sản phẩm trong đơn hàng
      const orderIds = orders.map((o) => o.order_id);
      const placeholders = orderIds.map(() => "?").join(", ");
      const itemSql = `
        SELECT 
          oi.order_id,
          oi.product_id,
          oi.quantity,
          oi.price,
          p.name,
          p.size,
          p.color
        FROM order_items oi
        JOIN sanpham p ON oi.product_id = p.id
        WHERE oi.order_id IN (${placeholders})
      `;

      db.query(itemSql, orderIds, (itemErr, items) => {
        if (itemErr) {
          console.error("Lỗi truy vấn chi tiết sản phẩm:", itemErr);
          return res.status(500).json({
            success: false,
            message: "Lỗi khi truy vấn chi tiết sản phẩm",
            error: itemErr.message,
          });
        }

        const groupedItems = {};
        items.forEach((item) => {
          if (!groupedItems[item.order_id]) {
            groupedItems[item.order_id] = [];
          }
          groupedItems[item.order_id].push({
            product_id: item.product_id,
            name: item.name,
            size: item.size,
            color: item.color,
            quantity: item.quantity,
            price: item.price,
          });
        });

        const result = orders.map((order) => ({
          ...order,
          items: groupedItems[order.order_id] || [],
        }));

        res.json({
          orders: result,
          totalOrders,
          totalPages,
          currentPage: page,
        });
      });
    });
  });
});

// Xóa đơn hàng theo ID
router.delete("/delete/:id", (req, res) => {
  const orderId = req.params.id;

  // Kiểm tra nếu ID là hợp lệ (có thể dùng cách khác để kiểm tra tùy theo yêu cầu)
  if (!orderId) {
    return res
      .status(400)
      .json({ success: false, message: "ID đơn hàng không hợp lệ" });
  }

  // SQL xóa đơn hàng
  const deleteOrderSql = "DELETE FROM orders WHERE id = ?";
  db.query(deleteOrderSql, [orderId], (err, result) => {
    if (err) {
      console.error("Lỗi khi xóa đơn hàng:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi xóa đơn hàng",
        error: err.message,
      });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Đơn hàng không tồn tại" });
    }

    return res
      .status(200)
      .json({ success: true, message: "Xóa đơn hàng thành công" });
  });
});
router.put("/:id/status", (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  const sql = "UPDATE orders SET status = ? WHERE id = ?";
  db.query(sql, [status, orderId], (err, result) => {
    if (err) {
      console.error("Lỗi cập nhật trạng thái:", err);
      return res.status(500).json({
        success: false,
        message: "Lỗi cập nhật trạng thái",
        error: err.message,
      });
    }

    return res.json({
      success: true,
      message: "Cập nhật trạng thái thành công",
    });
  });
});
router.get("/acv/:orderId", (req, res) => {
  const orderId = req.params.orderId;

  // Truy vấn thông tin đơn hàng
  const orderSql = `
    SELECT 
      o.id AS order_id,
      o.customer_name,
      o.customer_phone,
      o.customer_email,
      o.address,
      o.note,
      o.total,
      o.discount,
      o.shipping,
      o.final_total,
      o.payment_method,
      o.status,
      o.created_at
    FROM orders o
    WHERE o.id = ?
  `;

  db.query(orderSql, [orderId], (orderErr, orderResult) => {
    if (orderErr) {
      console.error("Lỗi khi truy vấn đơn hàng:", orderErr);
      return res.status(500).json({
        success: false,
        message: "Lỗi khi truy vấn đơn hàng",
        error: orderErr.message,
      });
    }

    if (orderResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy đơn hàng.",
      });
    }

    const order = orderResult[0];

    // Truy vấn chi tiết sản phẩm trong đơn hàng
    const itemsSql = `
      SELECT 
        oi.product_id,
        oi.quantity,
        oi.price,
        p.name AS product_name,
        oi.size,
        oi.color
      FROM order_items oi
      JOIN sanpham p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `;

    db.query(itemsSql, [orderId], (itemsErr, itemsResult) => {
      if (itemsErr) {
        console.error("Lỗi khi truy vấn chi tiết sản phẩm:", itemsErr);
        return res.status(500).json({
          success: false,
          message: "Lỗi khi truy vấn chi tiết sản phẩm",
          error: itemsErr.message,
        });
      }

      // Trả về kết quả chi tiết đơn hàng và các sản phẩm
      res.json({
        success: true,
        order: {
          ...order,
          items: itemsResult,
        },
      });
    });
  });
});
function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  keys.forEach((key) => {
    sorted[key] = obj[key];
  });
  return sorted;
}

router.post("/create-vnpay", async (req, res) => {
  const {
    customer_name,
    customer_phone,
    customer_email,
    address,
    note,
    total,
    discount,
    shipping,
    final_total,
    items,
    coupon_id,
  } = req.body;

  try {
    // 👉 Lưu đơn hàng trước
    const [orderRes] = await db.promise().query(
      `INSERT INTO orders (customer_name, customer_phone, customer_email, address, note, total, discount, shipping, final_total, payment_method, status, coupon_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'vnpay', 'pending', ?)`,
      [
        customer_name,
        customer_phone,
        customer_email,
        address,
        note,
        total,
        discount,
        shipping,
        parseInt(final_total),
        coupon_id || null,
      ]
    );

    const orderId = orderRes.insertId;

    for (const item of items) {
      await db.promise().query(
        `INSERT INTO order_items (order_id, product_id, quantity, price, size, color)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.product_id,
          item.quantity,
          item.price,
          item.size,
          item.color,
        ]
      );

      await db
        .promise()
        .query(
          `UPDATE sanpham SET quantity = quantity - ? WHERE id = ? AND quantity >= ?`,
          [item.quantity, item.product_id, item.quantity]
        );
    }

    if (coupon_id) {
      await db
        .promise()
        .query(
          `UPDATE coupons SET quantity = quantity - 1 WHERE id = ? AND quantity > 0`,
          [coupon_id]
        );
    }

    // 👉 Cấu hình VNPAY
    const tmnCode = process.env.VNP_TMNCODE;
    const secretKey = process.env.VNP_HASH_SECRET;
    const vnpUrl = process.env.VNP_URL;
    const returnUrl = process.env.VNP_RETURN_URL;

    const date = moment().format("YYYYMMDDHHmmss");
    const orderIdStr = String(orderId);
    const amount = (parseInt(final_total) * 100).toString();

    let ipAddr =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";

    if (ipAddr === "::1") ipAddr = "127.0.0.1";

    // 👉 Khởi tạo tham số gửi
    const vnp_Params = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: tmnCode,
      vnp_Amount: amount,
      vnp_CurrCode: "VND",
      vnp_TxnRef: orderIdStr,
      vnp_OrderInfo: `Thanh toan don hang :${orderIdStr}`,
      vnp_OrderType: "other",
      vnp_Locale: "vn",
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: date,
    };

    // 👉 Bước 1: Sắp xếp tham số
    const sortedParams = sortObject(vnp_Params);

    // 👉 Bước 2: Tạo chuỗi dữ liệu để ký (KHÔNG encode)
    const signData = qs.stringify(sortedParams, { encode: false });

    // 👉 Bước 3: Ký SHA512
    const secureHash = crypto
      .createHmac("sha512", secretKey)
      .update(signData, "utf-8")
      .digest("hex");

    // 👉 Bước 4: Gắn chữ ký và hashType (sau khi hash)
    sortedParams.vnp_SecureHash = secureHash;
    sortedParams.vnp_SecureHashType = "SHA512";

    // 👉 Bước 5: Tạo URL
    const paymentUrl = `${vnpUrl}?${qs.stringify(sortedParams, {
      encode: true,
    })}`;

    console.log("🌐 Final Payment URL:", paymentUrl);

    res.json({
      success: true,
      message: "Tạo link thanh toán thành công",
      paymentUrl,
      orderId,
    });
  } catch (err) {
    console.error("❌ Lỗi tạo đơn hàng VNPAY:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// VNP_HASH_SECRET=P7RQ2UUSUJLZ7CSVVPOG6E7AKMRTZAW9

router.get("/vnpay-return", async (req, res) => {
  const vnp_Params = req.query;

  const secureHash = vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHash;
  delete vnp_Params.vnp_SecureHashType;

  const sortedParams = sortObject(vnp_Params);
  const signData = qs.stringify(sortedParams, { encode: false });
  const hash = crypto
    .createHmac("sha512", process.env.VNP_HASH_SECRET)
    .update(signData, "utf-8")
    .digest("hex");

  const orderId = vnp_Params.vnp_TxnRef;

  const [orderRows] = await db
    .promise()
    .query("SELECT * FROM orders WHERE id = ?", [orderId]);

  if (orderRows.length === 0) {
    console.log("🚫 Không tìm thấy đơn hàng với ID:", orderId);
    return res
      .status(400)
      .json({ success: false, message: "Không tìm thấy đơn hàng." });
  }

  console.log("✅ VNPAY xác thực thành công:", orderId);
  res.send("Giao dịch hợp lệ");
});

module.exports = router;
