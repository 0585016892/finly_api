const db = require("../db");

// onlineUsers: userId -> Set of socketIds (để hỗ trợ nhiều thiết bị)
const onlineUsers = new Map();

function chatSocket(io) {
  // 📌 Truy vấn phản hồi từ chatbot
  function getBotReply(message, callback) {
    const lowerMsg = message.toLowerCase();

    const replySql = `
      SELECT reply FROM chatbot_replies
      WHERE ? LIKE CONCAT('%', keyword, '%')
      ORDER BY LENGTH(keyword) DESC
      LIMIT 1
    `;

    db.query(replySql, [lowerMsg], (err, results) => {
      if (err) return callback("Bot bị lỗi, bạn thử lại sau!");
      if (results.length > 0) return callback({ content: results[0].reply });

      // 🔍 Không có reply tĩnh → tìm sản phẩm
      const productSql = `
        SELECT name, slug, image FROM sanpham
        WHERE status = 'active' AND ? LIKE CONCAT('%', name, '%')
        LIMIT 1
      `;

      db.query(productSql, [lowerMsg], (err, prods) => {
        if (err || prods.length === 0) {
          return callback({
            content: "Xin lỗi, sản phẩm bạn hỏi hiện không có!",
          });
        }

        const p = prods[0];
        const link = `https://www.finlyshop.site/product/${p.slug}`;
        const img = `https://finlyapi-production.up.railway.app/uploads/${p.image}`;
        const reply = `✔️ Sản phẩm **${p.name}** hiện đang có hàng.\nXem tại: ${link}`;
        callback({ content: reply, image: img });
      });
    });
  }

  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // 📌 Đăng ký user
    socket.on("register", (userId) => {
      if (!userId) return;
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);

      console.log(`✅ ID ${userId} đăng ký với socket ${socket.id}`);

      // Gửi danh sách user online cho tất cả client
      io.emit("update_online_users", Array.from(onlineUsers.keys()));
    });

    // 📌 Gửi tin nhắn riêng
    socket.on("send_private_message", (data, callback) => {
      const { sender, receiver, content, image } = data;
      const timestamp = new Date();

      const isAdminOnline =
        onlineUsers.has("admin") && onlineUsers.get("admin").size > 0;

      // 🧠 Admin offline → bot xử lý
      if (receiver === "admin" && !isAdminOnline) {
        getBotReply(content, (reply) => {
          const botTime = new Date();

          // Lưu tin nhắn của khách
          db.query(
            "INSERT INTO chat_messages (sender, receiver, content, image, created_at) VALUES (?, ?, ?, ?, ?)",
            [sender, "admin", content, image || null, timestamp]
          );
          // Lưu phản hồi của bot
          db.query(
            "INSERT INTO chat_messages (sender, receiver, content, image, created_at) VALUES (?, ?, ?, ?, ?)",
            ["bot", sender, reply.content, reply.image || null, botTime]
          );

          // Gửi lại 2 tin nhắn về client
          const userMsg = {
            sender,
            receiver: "admin",
            content,
            timestamp: timestamp.getTime(),
          };

          const botMsg = {
            sender: "bot",
            receiver: sender,
            content: reply.content,
            image: reply.image || null,
            timestamp: botTime.getTime(),
          };

          socket.emit("receive_private_message", userMsg);
          socket.emit("receive_private_message", botMsg);

          callback && callback({ success: true });
        });

        return;
      }

      // ✅ Admin online → gửi như bình thường
      const sql =
        "INSERT INTO chat_messages (sender, receiver, content, created_at) VALUES (?, ?, ?, ?)";
      db.query(sql, [sender, receiver, content, timestamp], (err) => {
        if (err) {
          console.error("❌ Lỗi lưu tin nhắn:", err);
          callback && callback({ success: false });
          return;
        }

        const msg = {
          sender,
          receiver,
          content,
          timestamp: timestamp.getTime(),
        };

        // Gửi đến tất cả socket của receiver
        const receiverSockets = onlineUsers.get(receiver);
        if (receiverSockets) {
          receiverSockets.forEach((sockId) =>
            io.to(sockId).emit("receive_private_message", msg)
          );
        }

        // Gửi lại cho sender (đảm bảo hiển thị ngay)
        socket.emit("receive_private_message", msg);

        callback && callback({ success: true });
      });
    });

    // 📌 Khi disconnect
    socket.on("disconnect", () => {
      for (const [userId, sockets] of onlineUsers.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          console.log(`❌ Socket ${socket.id} của ${userId} đã disconnect`);

          if (sockets.size === 0) {
            onlineUsers.delete(userId);
            console.log(`❌ User ${userId} đã offline`);
          }

          io.emit("update_online_users", Array.from(onlineUsers.keys()));
          break;
        }
      }
    });
  });
}

module.exports = {
  chatSocket,
  onlineUsers,
};
