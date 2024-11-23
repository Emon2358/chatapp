// deno-lint-ignore-file no-unused-vars prefer-const ban-unused-ignore no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

interface User {
  username: string;
  iconPath: string;
  socket: WebSocket;
}

let users = new Map<string, User>(); // Connected users
let messageLog: { username: string; message: string; iconPath: string }[] = []; // Message log

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (pathname === "/") {
    try {
      const content = await Deno.readTextFile("./index.html");
      return new Response(content, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    } catch (err) {
      return new Response("File not found", { status: 404 });
    }
  }

  if (pathname === "/ws") {
    const { response, socket } = Deno.upgradeWebSocket(req);

    if (users.size === 0) {
      messageLog = []; // Reset the message log when the first user connects
      console.log("Chat log has been reset.");
    }

    socket.onopen = () => {
      console.log("New client connected.");

      // Send existing chat log to the new client
      messageLog.forEach(({ username, message, iconPath }) => {
        socket.send(
          JSON.stringify({ type: "message", username, message, iconPath })
        );
      });
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "register") {
        if (users.has(data.username)) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Username already taken",
            })
          );
          return;
        }

        users.set(data.username, {
          username: data.username,
          iconPath: data.iconPath || "default-icon.png",
          socket,
        });

        console.log(`User registered: ${data.username}`);
      }

      if (data.type === "message") {
        const user = users.get(data.username);

        if (!user || user.socket !== socket) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Invalid or duplicate user detected. Message ignored.",
            })
          );
          return;
        }

        const message = data.message.trim();
        if (!message) {
          // Do nothing if the message is empty
          return;
        }

        // Replace any URL in the message with a clickable link
        const urlPattern = /(https?:\/\/[^\s]+)/g;
        const messageWithLinks = message.replace(urlPattern, (url: any) => {
          return `<a href="${url}" target="_blank">${url}</a>`;
        });

        // Add the processed message to the log
        messageLog.push({
          username: data.username,
          message: messageWithLinks,
          iconPath: user.iconPath,
        });

        const payload = JSON.stringify({
          type: "message",
          username: data.username,
          message: messageWithLinks,
          iconPath: user.iconPath,
        });

        users.forEach((connectedUser) => {
          connectedUser.socket.send(payload);
        });

        console.log(`Message sent from ${data.username}: ${message}`);
      }
    };

    socket.onclose = () => {
      let disconnectedUser: string | null = null;

      users.forEach((user, username) => {
        if (user.socket === socket) {
          disconnectedUser = username;
          users.delete(username);
        }
      });

      if (disconnectedUser) {
        console.log(`User disconnected: ${disconnectedUser}`);
      }

      if (users.size === 0) {
        console.log("No users connected. Resetting chat log.");
        messageLog = [];
      }
    };

    return response;
  }

  return new Response("Not Found", { status: 404 });
}

console.log("Server running on http://localhost:8000");
await serve(handler);
