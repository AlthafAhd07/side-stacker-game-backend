import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
dotenv.config();

const app = express();

app.use(
  cors({
    credentials: true,
    origin: "*",
    "Access-Control-Allow-Origin": "*",
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));

const PORT = process.env.PORT || 5000;
const CLIENT__URL = process.env.CLIENT__URL || "http://localhost:3000";

app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Credentials", true);
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

app.get("/", (request, response) => {
  response.json({ msg: "hi friend how are you all" });
});

import { Server } from "socket.io";
import http from "http";

const server = http.Server(app);

server.listen(PORT, () => {
  console.log(`Server listning on port ${PORT}`);
});

const io = new Server(server, {
  cors: {
    origin: CLIENT__URL,
  },
});

io.use(async (socket, next) => {
  const username = socket.handshake.auth.username;

  if (!username) {
    return next(new Error("invalid connection"));
  }

  socket.username = username;
  next();
});

let onlineUsers = [];

io.on("connection", async (socket) => {
  // When user connected

  const username = socket.username;

  console.log(`${username} just connected`);

  onlineUsers.unshift({ username, inGame: false });

  for (let [id, socketUser] of io.of("/").sockets) {
    if (socketUser.username !== username) {
      socketUser.emit("updateOnline", {
        username,
        inGame: false,
      });
    }
  }

  function updateGamingState(username, state) {
    for (let [id, socketUser] of io.of("/").sockets) {
      if (socketUser.username !== username) {
        socketUser.emit("updateGamingState", {
          username,
          inGame: state,
        });
      }
    }
  }

  socket.emit(
    "onlineusers",
    onlineUsers.filter((i) => i.username !== username)
  );

  socket.on("requestGame", ({ from, to }) => {
    for (let [id, socketUser] of io.of("/").sockets) {
      if (socketUser.username === to) {
        socketUser.emit("listenToRequests", {
          from: from,
        });
      }
    }
  });

  socket.on("responceToRequest", (data) => {
    onlineUsers = onlineUsers.map((i) => {
      if (i.username === data.from) {
        return {
          ...i,
          inGame: true,
        };
      } else {
        return i;
      }
    });

    updateGamingState(data.from, true);

    socket.join(data.roomId);

    for (let [id, socketUser] of io.of("/").sockets) {
      if (socketUser.username === data.to) {
        socketUser.emit("listenForRequestResponce", data);
      }
    }
  });

  socket.on("StartPlay", (data, username) => {
    onlineUsers = onlineUsers.map((i) => {
      if (i.username === username) {
        return {
          ...i,
          inGame: true,
        };
      } else {
        return i;
      }
    });
    updateGamingState(username, true);

    socket.join(data);

    socket.to(data).emit("listenTurn", username);
  });

  socket.on("opponentInput", ({ roomId, data }) => {
    socket.to(roomId).emit("ReceiveOpponentInput", data);
  });

  socket.on("leaveRoom", ({ roomId, username, opponent }) => {
    onlineUsers = onlineUsers.map((i) => {
      if (i.username === username) {
        return {
          ...i,
          inGame: false,
        };
      } else if (i.username === opponent) {
        return {
          ...i,
          inGame: false,
        };
      } else {
        return i;
      }
    });
    updateGamingState(username, false);
    updateGamingState(opponent, false);

    socket.to(roomId).emit("listenOpponentLeft", username);

    socket.leave(roomId);
  });

  socket.on("ResponceOpponentLeft", ({ roomId }) => {
    socket.leave(roomId);
  });

  socket.on("sendTurn", ({ roomId, opponent }) => {
    socket.to(roomId).emit("listenTurn", opponent);
  });

  // when user Disconnected
  socket.on("disconnect", async () => {
    onlineUsers = onlineUsers.filter((d) => d.username !== username);

    for (const entry of io.sockets.adapter.rooms.entries()) {
      const roomId = entry[0];
      if (roomId.split("_").includes(username)) {
        socket.to(roomId).emit("listenOpponentLeft", username);
      }
    }

    for (let [id, socketUser] of io.of("/").sockets) {
      if (socketUser.username !== username) {
        socketUser.emit("updateOffline", username);
      }
    }
    console.log(`user ${username} disconnected`);
  });
});
