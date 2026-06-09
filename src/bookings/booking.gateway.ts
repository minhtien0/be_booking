import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

/**
 * Payload đầy đủ để frontend có thể:
 *  1. Render toast ngay lập tức (không cần gọi thêm API)
 *  2. Prepend booking row vào bảng mà không reload toàn bộ
 */
export interface BookingConfirmedPayload {
  // ── Dùng cho Toast ────────────────────────────────────────────────────
  bookingId:     number;
  bookingCode:   string;          // "BK042"
  customerName:  string;
  customerPhone: string;          // masked: "090****567"
  bookingDate:   string;          // "2026-06-05"
  slotStart:     string;          // "09:00"
  slotEnd:       string;          // "09:45"
  serviceName:   string;          // "Cắt + Gội"
  barberName:    string;          // "Minh Tú"
  price:         number;          // 120000

  // ── Dùng để prepend vào bảng ──────────────────────────────────────────
  row: {
    id:        number;
    code:      string | null;
    customer:  string;
    phone:     string;
    initials:  string;
    service:   string;
    barber:    string;
    barberId:  number | null;
    date:      string;
    time:      string;
    endTime:   string;
    price:     number;
    status:    string;            
    visits:    number;
    note:      string;
  };
}

@WebSocketGateway({
  cors: {
    // Cấu hình domain cụ thể khi production
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
  // Namespace riêng để tránh conflict nếu sau này thêm gateway khác
  namespace: '/admin',
})
export class BookingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BookingGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`[WS] Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[WS] Client disconnected: ${client.id}`);
  }

  /**
   * Lắng nghe event 'booking.confirmed' từ BookingsService.
   * Emit 'booking:new' ra tất cả admin clients đang kết nối.
   *
   * Tên event 'booking:new' thay vì 'new_booking_confirmed' — ngắn gọn hơn,
   * dùng namespace convention để dễ mở rộng ('booking:updated', 'booking:cancelled'...).
   */
  @OnEvent('booking.confirmed')
  handleBookingConfirmed(payload: BookingConfirmedPayload) {
    this.logger.log(`[WS] Emit booking:new — id=${payload.bookingId} code=${payload.bookingCode}`);
    this.server.emit('booking:new', payload);
  }
}