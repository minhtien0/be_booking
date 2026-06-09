import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { BookingConfirmedPayload } from '../../bookings/booking.gateway';

@Injectable()
export class TelegramService implements OnModuleInit {
    private readonly logger = new Logger(TelegramService.name);
    private readonly token: string;
    private readonly chatIds: string[];  
    private readonly apiBase: string;

    constructor(private readonly config: ConfigService) {
        this.token = this.config.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
        // TELEGRAM_CHAT_IDS: "-100123456,987654321" (dùng dấu phẩy để tách nhiều chat)
        this.chatIds = this.config.getOrThrow<string>('TELEGRAM_CHAT_IDS')
            .split(',')
            .map(id => id.trim())
            .filter(Boolean);
        this.apiBase = `https://api.telegram.org/bot${this.token}`;
    }

    // ── Kiểm tra kết nối khi module khởi động ────────────────────────────────
    async onModuleInit() {
        try {
            const me = await this.callApi<{ username: string }>('getMe');
            this.logger.log(`[TELEGRAM] Bot online: @${me.username} → chatIds: [${this.chatIds.join(', ')}]`);
        } catch (err) {
            this.logger.error('[TELEGRAM] Không kết nối được bot. Kiểm tra TELEGRAM_BOT_TOKEN.', err);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lắng nghe event booking.confirmed → gửi thông báo
    // ─────────────────────────────────────────────────────────────────────────
    @OnEvent('booking.confirmed', { async: true })
    async handleBookingConfirmed(payload: BookingConfirmedPayload): Promise<void> {
        const message = this.buildBookingMessage(payload);
        await this.broadcast(message);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gửi đến tất cả chatIds cấu hình
    // ─────────────────────────────────────────────────────────────────────────
    async broadcast(text: string): Promise<void> {
        await Promise.allSettled(
            this.chatIds.map(chatId => this.sendMessage(chatId, text)),
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Gửi 1 tin nhắn tới 1 chat cụ thể (có retry 1 lần)
    // ─────────────────────────────────────────────────────────────────────────
    async sendMessage(chatId: string, text: string, retries = 1): Promise<void> {
        try {
            await this.callApi('sendMessage', {
                chat_id: chatId,
                text,
                parse_mode: 'HTML',
                // Tắt preview link để message gọn hơn
                link_preview_options: { is_disabled: true },
            });
            this.logger.log(`[TELEGRAM] Sent to chatId=${chatId}`);
        } catch (err: any) {
            this.logger.error(`[TELEGRAM] Failed chatId=${chatId}: ${err?.message}`);
            if (retries > 0) {
                // Chờ 3 giây rồi retry 1 lần
                await new Promise(r => setTimeout(r, 3_000));
                return this.sendMessage(chatId, text, retries - 1);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Format nội dung tin nhắn (HTML Telegram)
    // ─────────────────────────────────────────────────────────────────────────
    private buildBookingMessage(p: BookingConfirmedPayload): string {
        const date = this.formatDate(p.bookingDate)           // "05/06/2026"
        const price = p.price.toLocaleString('vi-VN') + 'đ'   // "120.000đ"

        return [
            `🔔 <b>ĐƠN ĐẶT LỊCH MỚI</b>`,
            ``,
            `📋 <b>Mã đơn:</b>  <code>${p.bookingCode}</code>`,
            `👤 <b>Khách:</b>   ${this.escapeHtml(p.customerName)}`,
            `📞 <b>SĐT:</b>     <code>${p.customerPhone}</code>`,
            `✂️ <b>Dịch vụ:</b> ${this.escapeHtml(p.serviceName)}`,
            `💈 <b>Barber:</b>  ${this.escapeHtml(p.barberName ?? '—')}`,       
            `📅 <b>Ngày:</b>    ${date}`,                              
            `🕐 <b>Giờ:</b>     ${p.slotStart} – ${p.slotEnd}`,          
            `💰 <b>Giá:</b>     ${price}`,                               
            ``,
            `✅ <i>Xác nhận lúc ${new Date().toLocaleTimeString('vi-VN')}</i>`,
        ].join('\n')
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Internal: gọi Telegram Bot API
    // ─────────────────────────────────────────────────────────────────────────
    private async callApi<T = unknown>(method: string, body?: Record<string, unknown>): Promise<T> {
        const res = await fetch(`${this.apiBase}/${method}`, {
            method: body ? 'POST' : 'GET',
            headers: { 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });

        const json = await res.json() as { ok: boolean; result?: T; description?: string };

        if (!json.ok) {
            throw new Error(`Telegram API error [${method}]: ${json.description}`);
        }

        return json.result as T;
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    private formatDate(dateStr: string): string {
        const [y, m, d] = dateStr.split('-');
        return `${d}/${m}/${y}`;
    }

    private maskPhone(phone: string): string {
        return phone.slice(0, 3) + '****' + phone.slice(-3);
    }

    /** Escape ký tự đặc biệt HTML để tránh parse lỗi */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }
}