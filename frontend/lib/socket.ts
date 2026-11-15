import { io, type Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

let socket: Socket | null = null;

/**
 * Returns a shared Socket.IO connection.
 * The auth cookie is sent automatically with `withCredentials`.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Emits a Socket.IO event and waits for the server acknowledgement.
 * Rejects when the server reports an error or does not answer in time.
 */
export function emitWithAck<T>(event: string, payload: unknown, timeout = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const client = getSocket();
    const timer = window.setTimeout(() => {
      reject(new Error('The server did not respond. Check your connection and try again.'));
    }, timeout);
    client.emit(event, payload, (response: T) => {
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}
