import { Injectable,Inject,forwardRef } from '@nestjs/common';
import { BookingsService } from './../bookings.service';
import * as crypto from 'crypto';

@Injectable()
export class BookingCryptoService {
  constructor(
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
  ) { }

  // Không thể khôi phục lại số điện thoại gốc.
  hashPhone(phone: string): string {
    return crypto.createHash('sha256').update(phone).digest('hex');
  }

  // Mã hóa sdt thành 4f6d3a...:8c91ab... (Lưu DB an toàn.)
  encryptPhone(phone: string): string {
    const key = this.getPhoneEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(phone, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  // Giải mã chuỗi kí tự
  decryptPhone(encrypted: string): string {
    if (!encrypted.includes(':')) return encrypted;

    const [ivHex, dataHex] = encrypted.split(':');
    const key = this.getPhoneEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }

  // Ẩn bớt số điện thoại 090****567
  maskPhone(phone: string): string {
    return phone.slice(0, 3) + '****' + phone.slice(-3);
  }

  private getPhoneEncryptionKey(): Buffer {
    const keyHex = process.env.PHONE_ENCRYPT_KEY;
    if (!keyHex || !/^[a-f0-9]{64}$/i.test(keyHex)) {
      throw new Error('PHONE_ENCRYPT_KEY must be a 64-character hex string.');
    }
    return Buffer.from(keyHex, 'hex');
  }
}