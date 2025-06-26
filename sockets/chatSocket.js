const db = require("../db");

// onlineUsers: userId -> Set of socketIds (hỗ trợ nhiều kết nối cùng user)
const onlineUsers = new Map();

function chatSocket(io) {
  io.on("connection", (socket) => {
    console.log("🔌 Client connected:", socket.id);

    // Đăng ký user
    socket.on("register", (userId) => {
      if (!userId) return;
      if (!onlineUsers.has(userId)) {
        onlineUsers.set(userId, new Set());
      }
      onlineUsers.get(userId).add(socket.id);

      console.log(`✅ ID ${userId} đăng với socket ${socket.id}`);

      // Gửi cập nhật danh sách user online cho tất cả client
      io.emit("update_online_users", Array.from(onlineUsers.keys()));
    });

    // Nhận tin nhắn riêng
    socket.on("send_private_message", (data, callback) => {
      // Log dữ liệu nhận được
      console.log("Tin nhắn từ client:", data);
      const { sender, receiver, content } = data;
      if (!sender || !receiver || !content) {
        callback && callback({ success: false, error: "Dữ liệu không hợp lệ" });
        return;
      }
      const timestamp = new Date();

      // Lưu tin nhắn vào DB
      const sql =
        "INSERT INTO chat_messages (sender, receiver, content, created_at) VALUES (?, ?, ?, ?)";
      db.query(sql, [sender, receiver, content, timestamp], (err, results) => {
        if (err) {
          console.error("❌ Lỗi lưu tin nhắn:", err);
          callback && callback({ success: false, error: "Lỗi lưu tin nhắn" });
          return;
        }

        console.log("✅ Tin nhắn đã lưu vào DB");

        // Chuẩn bị dữ liệu gửi lại (cập nhật timestamp chính xác)
        const messageData = {
          sender,
          receiver,
          content,
          timestamp: timestamp.getTime(),
        };

        // Gửi tin nhắn cho tất cả socket của receiver
        const receiverSockets = onlineUsers.get(receiver);
        if (receiverSockets) {
          receiverSockets.forEach((sockId) => {
            io.to(sockId).emit("receive_private_message", messageData);
          });
        }
        // Gửi tin nhắn cho tất cả socket của sender (trừ socket hiện tại)
        const senderSockets = onlineUsers.get(sender);
        if (senderSockets) {
          senderSockets.forEach((sockId) => {
            if (sockId !== socket.id) {
              io.to(sockId).emit("receive_private_message", messageData);
            }
          });
        }
        // Gửi lại tin nhắn cho chính người gửi qua socket hiện tại
        socket.emit("receive_private_message", messageData);

        callback && callback({ success: true });
      });
    });

    // Xử lý disconnect socket
    socket.on("disconnect", () => {
      // Tìm userId tương ứng socket
      for (const [userId, sockets] of onlineUsers.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          console.log(
            `❌ Socket ${socket.id} của User ${userId} đã disconnect`
          );

          // Nếu không còn socket nào của user, xóa user khỏi danh sách online
          if (sockets.size === 0) {
            onlineUsers.delete(userId);
            console.log(`❌ User ${userId} đã offline`);
          }

          // Cập nhật danh sách online user cho tất cả client
          io.emit("update_online_users", Array.from(onlineUsers.keys()));
          break;
        }
      }
    });
  });
}

module.exports = chatSocket;
