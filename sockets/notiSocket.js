let ioInstance;

function initSocket(io) {
  ioInstance = io;

  ioInstance.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });
}

function notifyNewOrder(order) {
  if (!ioInstance) {
    console.error("Socket.io chưa được khởi tạo!");
    return;
  }
  ioInstance.emit("newOrderNotification", {
    message: `Đơn hàng #${order.id} mới được tạo!`,
    orderId: order.id,
  });
}

module.exports = { initSocket, notifyNewOrder };
