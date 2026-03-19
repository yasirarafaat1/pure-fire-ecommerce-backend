import net from "net";
import tls from "tls";

const encode = (str) => Buffer.from(str, "utf8").toString("base64");

const readReply = (socket) =>
  new Promise((resolve, reject) => {
    const onData = (data) => {
      socket.off("error", onError);
      resolve(data.toString());
    };
    const onError = (err) => {
      socket.off("data", onData);
      reject(err);
    };
    socket.once("data", onData);
    socket.once("error", onError);
  });

const sendCommand = async (socket, cmd) => {
  socket.write(cmd + "\r\n");
  return await readReply(socket);
};

export async function sendSmtpMail({
  host,
  port = 587,
  secure = false,
  user,
  pass,
  from,
  to,
  subject,
  text,
}) {
  return new Promise((resolve, reject) => {
    const socketFactory = secure ? tls : net;
    const socket = socketFactory.connect(
      { host, port, servername: host, timeout: 10000 },
      async () => {
        try {
          socket.setTimeout(10000, () =>
            socket.destroy(new Error("SMTP timeout"))
          );

          // consume banner
          await readReply(socket);

          await sendCommand(socket, "EHLO localhost");

          if (!secure) {
            await sendCommand(socket, "STARTTLS");
            socket.removeAllListeners("data");
            socket.removeAllListeners("error");
            const tlsSocket = tls.connect(
              { socket, servername: host, timeout: 10000 },
              async () => {
                try {
                  tlsSocket.setTimeout(10000, () =>
                    tlsSocket.destroy(new Error("SMTP TLS timeout"))
                  );
                  await readReply(tlsSocket);
                  await sendCommand(tlsSocket, "EHLO localhost");
                  await authAndSend(tlsSocket);
                } catch (err) {
                  tlsSocket.end();
                  reject(err);
                }
              }
            );
            tlsSocket.once("error", reject);
            tlsSocket.once("timeout", () =>
              tlsSocket.destroy(new Error("SMTP TLS timeout"))
            );
            return;
          }

          // for implicit TLS we already are in TLS; no second banner needed
          await authAndSend(socket);
        } catch (err) {
          socket.end();
          reject(err);
        }
      }
    );
    socket.once("error", reject);
    socket.once("timeout", () => socket.destroy(new Error("SMTP timeout")));

    const authAndSend = async (sock) => {
      await sendCommand(sock, "AUTH LOGIN");
      await sendCommand(sock, encode(user));
      await sendCommand(sock, encode(pass));
      await sendCommand(sock, `MAIL FROM:<${from}>`);
      await sendCommand(sock, `RCPT TO:<${to}>`);
      await sendCommand(sock, "DATA");
      const message =
        `From: ${from}\r\n` +
        `To: ${to}\r\n` +
        `Subject: ${subject}\r\n` +
        `MIME-Version: 1.0\r\n` +
        `Content-Type: text/plain; charset=utf-8\r\n` +
        `Content-Transfer-Encoding: 7bit\r\n\r\n` +
        `${text}\r\n.\r\n`;
      await sendCommand(sock, message);
      await sendCommand(sock, "QUIT");
      sock.end();
      resolve();
    };
  });
}
