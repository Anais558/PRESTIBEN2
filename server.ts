import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "up", timestamp: new Date() });
  });

  // Simple In-memory storage for prototype
  const activeProviders = new Set();
  const requests = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join", (role) => {
      console.log(`User ${socket.id} joined as ${role}`);
      if (role === "provider") {
        activeProviders.add(socket.id);
      }
    });

    socket.on("request_service", (data) => {
      const requestId = Math.random().toString(36).substring(7);
      const request = {
        id: requestId,
        clientId: socket.id,
        service: data.service,
        location: data.location,
        status: "pending",
        createdAt: new Date(),
      };
      requests.set(requestId, request);

      // Simple matching simulation: notify all providers
      io.emit("new_request", request);
      console.log("New request emitted:", requestId);
    });

    socket.on("accept_request", (data) => {
      const { requestId } = data;
      const request = requests.get(requestId);
      if (request && request.status === "pending") {
        request.status = "matched";
        request.providerId = socket.id;
        requests.set(requestId, request);

        // Notify client and provider
        io.to(request.clientId).emit("request_matched", request);
        io.to(socket.id).emit("match_confirmed", request);
        console.log(`Request ${requestId} matched with provider ${socket.id}`);
      }
    });

    socket.on("disconnect", () => {
      activeProviders.delete(socket.id);
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
