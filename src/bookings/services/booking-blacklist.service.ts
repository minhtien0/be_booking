import { Injectable, ForbiddenException, forwardRef, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneBlacklist, BlacklistReason } from '../../phones/entities/blacklist.entity';
import { Booking } from './../entities/booking.entity';
import { BookingCryptoService } from './booking-crypto.service';
import { BookingsService } from './../bookings.service';

const NO_SHOW_THRESHOLD = 2;

@Injectable()
export class BookingBlacklistService {
  constructor(
    @InjectRepository(PhoneBlacklist)
    private readonly blacklistRepo: Repository<PhoneBlacklist>,
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,
    private readonly cryptoService: BookingCryptoService,
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
  ) { }

  async checkBlacklist(phoneHash: string): Promise<void> {
    const entry = await this.blacklistRepo.findOne({
      where: { phoneHash, isActive: true },
    });
    if (!entry) return;

    const now = new Date();
    if (!entry.blockedUntil || entry.blockedUntil > now) {
      throw new ForbiddenException(
        'Số điện thoại này tạm thời bị khóa do vi phạm nội quy tiệm nhiều lần.',
      );
    }

    // Hết hạn block → tự động gỡ bộ lọc bận
    entry.isActive = false;
    await this.blacklistRepo.save(entry);
  }

  async handleNoShowBlacklist(phoneHash: string, phoneEncrypted: string): Promise<void> {
    const noShowCount = await this.bookingRepo.count({
      where: { customerPhoneHash: phoneHash, isNoShow: true },
    });

    if (noShowCount < NO_SHOW_THRESHOLD) return;

    const blockedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 ngày khóa
    const existing = await this.blacklistRepo.findOne({ where: { phoneHash } });

    if (existing) {
      existing.noShowCount = noShowCount;
      existing.isActive = true;
      existing.blockedUntil = blockedUntil;
      await this.blacklistRepo.save(existing);
    } else {
      const phone = this.cryptoService.decryptPhone(phoneEncrypted);
      await this.blacklistRepo.save(
        this.blacklistRepo.create({
          phoneHash,
          phoneMasked: this.cryptoService.maskPhone(phone),
          noShowCount,
          reason: BlacklistReason.NO_SHOW,
          isActive: true,
          blockedUntil,
          note: `Hệ thống tự động khóa sau ${noShowCount} lần bùng lịch.`,
        }),
      );
    }
  }
}