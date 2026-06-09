import {
  Injectable, NotFoundException, BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';

import { Booking, BookingStatus, VALID_TRANSITIONS } from '../../bookings/entities/booking.entity';
import { BookingLog }   from '../../bookinglogs/entities/bookinglog.entity';
import { Barber, BarberStatus } from '../../barbers/entities/barber.entity';
import { Service }      from '../../services/entities/service.entity';

import { AdminListBookingsQueryDto } from '../dto/list-booking-query.dto';
import { UpdateBookingStatusDto }    from '../dto/booking-status.dto';
import { RescheduleBookingDto }      from '../dto/reschedule-booking.dto';
import { UpdateBookingNoteDto }      from '../dto/update-booking.dto';
import { BulkUpdateStatusDto }       from '../dto/bulk-update-status-dto';

// Log color keys (chỉ dùng nội bộ admin, không expose ra ngoài) 

type LogColorKey =
  | 'admin_status'   // xanh lá — admin đổi trạng thái
  | 'admin_reschedule' // tím — admin đổi giờ/ngày
  | 'admin_note'     // xanh dương — admin cập nhật ghi chú
  | 'admin_bulk'     // cam — bulk action
  | 'admin_delete';  // đỏ — xóa (log trước khi xóa)

const LOG_COLORS: Record<LogColorKey, string> = {
  admin_status:     '#16a34a', // green-600
  admin_reschedule: '#7c3aed', // violet-700
  admin_note:       '#2563eb', // blue-600
  admin_bulk:       '#ea580c', // orange-600
  admin_delete:     '#dc2626', // red-600
};

// Response shape types 

export interface BookingRow {
  id: number;
  code: string | null;
  customer: string;
  phone: string;
  initials: string;
  service: string;
  barber: string;
  barberId: number | null;
  date: string;
  time: string;
  endTime: string;
  price: number;
  status: BookingStatus;
  visits: number;
  note: string;
}

export interface StatsResponse {
  counts: {
    all: number; today: number; pending: number; confirmed: number;
    inprogress: number; done: number; cancelled: number; expired: number;
  };
  todayRevenue: number;
  monthRevenue: number;
  completionRate: number;
  pendingAlert: number;
}

export interface BarberDutyItem {
  id: number; name: string; initials: string;
  bookingsToday: number; doneToday: number;
  status: BarberStatus; online: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function maskPhone(phone: string | null): string {
  if (!phone) return '—';
  const p = phone.replace(/\s/g, '');
  return p.length >= 7 ? p.slice(0, 3) + '****' + p.slice(-3) : p;
}

function toInitials(name: string): string {
  return name.trim().split(/\s+/).slice(-2).map(w => w[0]).join('').toUpperCase();
}

function todayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

function calcEndTime(start: string, durationMin: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AdminBookingsService {
  private readonly logger = new Logger(AdminBookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private readonly bookingRepo: Repository<Booking>,

    @InjectRepository(BookingLog)
    private readonly logRepo: Repository<BookingLog>,

    @InjectRepository(Barber)
    private readonly barberRepo: Repository<Barber>,

    @InjectRepository(Service)
    private readonly serviceRepo: Repository<Service>,
  ) {}

  // ─── Private: ghi log nghiệp vụ ──────────────────────────────────────────

  /**
   * Tạo 1 BookingLog liên kết với booking.
   * actionText: mô tả rõ hành động + giá trị thay đổi để dễ audit.
   * Chỉ gọi trong các method write (updateStatus, reschedule, updateNote, bulk, remove).
   */
  private async addLog(
    bookingId: number,
    actionText: string,
    colorKey: LogColorKey,
  ): Promise<void> {
    const log = this.logRepo.create({
      actionText,
      color:   LOG_COLORS[colorKey],
      booking: { id: bookingId } as Booking,
    });
    await this.logRepo.save(log);
  }

  // ─── Private: map entity → row ────────────────────────────────────────────

  private async toRow(b: Booking, visitsMap?: Map<string, number>): Promise<BookingRow> {
    const visits = visitsMap?.get(b.customerPhoneHash ?? '') ?? 0;
    return {
      id:       b.id,
      code:     b.bookingCode,
      customer: b.customerName,
      phone:    maskPhone(b.customerPhone),
      initials: toInitials(b.customerName),
      service:  b.service?.name ?? b.combo?.name ?? '—',
      barber:   b.barber?.name  ?? '—',
      barberId: b.barberId,
      date:     b.bookingDate,
      time:     b.slotStartTime,
      endTime:  b.slotEndTime ?? calcEndTime(b.slotStartTime, b.totalDuration),
      price:    b.snapshotPrice,
      status:   b.status,
      visits,
      note:     b.note ?? '',
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // READ methods — không ghi log
  // ══════════════════════════════════════════════════════════════════════════

  async findAll(query: AdminListBookingsQueryDto) {
    const { search, status, barberId, serviceId, date, tab, page = 1, limit = 8 } = query;
    const today = todayDateStr();

    const qb = this.bookingRepo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.barber',  'barber')
      .leftJoinAndSelect('b.service', 'service')
      .leftJoinAndSelect('b.combo',   'combo')
      .orderBy('b.bookingDate', 'DESC')
      .addOrderBy('b.slotStartTime', 'ASC');

    if (tab === 'today') {
      qb.andWhere('b.bookingDate = :today', { today });
    } else if (tab && tab !== 'all' && Object.values(BookingStatus).includes(tab as BookingStatus)) {
      qb.andWhere('b.status = :tabStatus', { tabStatus: tab });
    }

    if (status)    qb.andWhere('b.status = :status',      { status });
    if (barberId)  qb.andWhere('b.barberId = :barberId',  { barberId });
    if (date)      qb.andWhere('b.bookingDate = :date',   { date });
    if (serviceId) qb.andWhere('service.id = :serviceId', { serviceId });

    if (search) {
      const like = `%${search}%`;
      qb.andWhere(
        '(b.customerName ILIKE :like OR b.customerPhone ILIKE :like OR b.bookingCode ILIKE :like)',
        { like },
      );
    }

    const total = await qb.getCount();
    qb.skip((page - 1) * limit).take(limit);
    const bookings = await qb.getMany();

    const hashes = [...new Set(bookings.map(b => b.customerPhoneHash).filter(Boolean))] as string[];
    const visitsMap = new Map<string, number>();
    if (hashes.length) {
      const rows = await this.bookingRepo
        .createQueryBuilder('b')
        .select('b.customerPhoneHash', 'hash')
        .addSelect('COUNT(*)', 'cnt')
        .where('b.customerPhoneHash IN (:...hashes)', { hashes })
        .andWhere('b.status = :done', { done: BookingStatus.DONE })
        .groupBy('b.customerPhoneHash')
        .getRawMany<{ hash: string; cnt: string }>();
      rows.forEach(r => visitsMap.set(r.hash, Number(r.cnt)));
    }

    const data = await Promise.all(bookings.map(b => this.toRow(b, visitsMap)));
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getStats(): Promise<StatsResponse> {
    const today = todayDateStr();
    const firstOfMonth = today.slice(0, 8) + '01';

    const [todayRows, monthRows, totalCount] = await Promise.all([
      this.bookingRepo.find({ where: { bookingDate: today }, select: ['id', 'status', 'snapshotPrice'] }),
      this.bookingRepo.createQueryBuilder('b')
        .select(['b.status', 'b.snapshotPrice'])
        .where('b.bookingDate >= :first', { first: firstOfMonth })
        .andWhere('b.bookingDate <= :today', { today })
        .getMany(),
      this.bookingRepo.count(),
    ]);

    const countsByStatus = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('b.status')
      .getRawMany<{ status: string; cnt: string }>();

    const statusMap = new Map(countsByStatus.map(r => [r.status, Number(r.cnt)]));
    const todayRevenue   = todayRows.filter(b => b.status === BookingStatus.DONE).reduce((s, b) => s + b.snapshotPrice, 0);
    const monthRevenue   = monthRows.filter(b => b.status === BookingStatus.DONE).reduce((s, b) => s + b.snapshotPrice, 0);
    const todayDone      = todayRows.filter(b => b.status === BookingStatus.DONE).length;
    const todayFinished  = todayRows.filter(b => [BookingStatus.DONE, BookingStatus.CANCELLED].includes(b.status)).length;
    const completionRate = todayFinished > 0 ? Math.round((todayDone / todayFinished) * 100) : 0;

    return {
      counts: {
        all:        totalCount,
        today:      todayRows.length,
        pending:    statusMap.get(BookingStatus.PENDING)     ?? 0,
        confirmed:  statusMap.get(BookingStatus.CONFIRMED)   ?? 0,
        inprogress: statusMap.get(BookingStatus.IN_PROGRESS) ?? 0,
        done:       statusMap.get(BookingStatus.DONE)        ?? 0,
        cancelled:  statusMap.get(BookingStatus.CANCELLED)   ?? 0,
        expired:    statusMap.get(BookingStatus.EXPIRED)     ?? 0,
      },
      todayRevenue, monthRevenue, completionRate,
      pendingAlert: statusMap.get(BookingStatus.PENDING) ?? 0,
    };
  }

  async getBarbersDuty(): Promise<BarberDutyItem[]> {
    const today = todayDateStr();
    const barbers = await this.barberRepo.find({ where: { status: BarberStatus.ACTIVE }, order: { name: 'ASC' } });

    const todayStats = await this.bookingRepo
      .createQueryBuilder('b')
      .select('b.barberId', 'barberId')
      .addSelect('b.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .where('b.bookingDate = :today', { today })
      .andWhere('b.barberId IS NOT NULL')
      .groupBy('b.barberId, b.status')
      .getRawMany<{ barberId: number; status: string; cnt: string }>();

    const statsByBarber = new Map<number, { total: number; done: number; hasActiveNow: boolean }>();
    for (const row of todayStats) {
      const bid = Number(row.barberId);
      const cnt = Number(row.cnt);
      const cur = statsByBarber.get(bid) ?? { total: 0, done: 0, hasActiveNow: false };
      cur.total += cnt;
      if (row.status === BookingStatus.DONE)        cur.done += cnt;
      if (row.status === BookingStatus.IN_PROGRESS) cur.hasActiveNow = true;
      statsByBarber.set(bid, cur);
    }

    return barbers.map(b => {
      const s = statsByBarber.get(b.id) ?? { total: 0, done: 0, hasActiveNow: false };
      return {
        id: b.id, name: b.name, initials: toInitials(b.name),
        bookingsToday: s.total, doneToday: s.done, status: b.status,
        online: b.status === BarberStatus.ACTIVE && (s.hasActiveNow || s.total > 0),
      };
    });
  }

  async getCalendarDots(year: number, month: number): Promise<{ dates: string[] }> {
    const first = `${year}-${String(month).padStart(2, '0')}-01`;
    const last  = new Date(year, month, 0).toISOString().split('T')[0];

    const rows = await this.bookingRepo
      .createQueryBuilder('b')
      .select('DISTINCT b.bookingDate', 'date')
      .where('b.bookingDate >= :first', { first })
      .andWhere('b.bookingDate <= :last', { last })
      .andWhere('b.status NOT IN (:...skip)', {
        skip: [BookingStatus.EXPIRED, BookingStatus.CANCELLED],
      })
      .getRawMany<{ date: string }>();

    return { dates: rows.map(r => r.date) };
  }

  async findOne(id: number) {
    const b = await this.bookingRepo.findOne({
      where: { id },
      relations: ['barber', 'service', 'combo', 'logs'],
    });
    if (!b) throw new NotFoundException(`Booking #${id} không tồn tại.`);

    let visits = 0;
    if (b.customerPhoneHash) {
      visits = await this.bookingRepo.count({
        where: { customerPhoneHash: b.customerPhoneHash, status: BookingStatus.DONE },
      });
    }

    return {
      ...(await this.toRow(b, new Map([[b.customerPhoneHash ?? '', visits]]))),
      email:              b.customerEmail,
      paymentStatus:      b.paymentStatus,
      paymentMethod:      b.paymentMethod,
      confirmedAt:        b.confirmedAt,
      cancelledAt:        b.cancelledAt,
      cancellationReason: b.cancellationReason,
      editedAt:           b.editedAt,
      editReason:         b.editReason,
      isNoShow:           b.isNoShow,
      // ← logs được trả về để frontend có thể hiển thị timeline nếu cần
      //   nhưng service này KHÔNG tự hiển thị — đó là việc của view
      logs: b.logs
        ?.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(l => ({ id: l.id, actionText: l.actionText, color: l.color, createdAt: l.createdAt }))
        ?? [],
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WRITE methods — đều ghi log
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Cập nhật trạng thái đơn lẻ.
   *
   * Log ghi: "[Admin] pending → confirmed" hoặc "[Admin] Huỷ — Lý do: ..."
   * Color:   admin_status (xanh lá)
   */
  async updateStatus(id: number, dto: UpdateBookingStatusDto) {
    const b = await this.bookingRepo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Booking #${id} không tồn tại.`);

    // Admin bypass — chỉ warn, không throw
    if (!VALID_TRANSITIONS[b.status].includes(dto.status)) {
      this.logger.warn(`[ADMIN_FORCE] booking=${id} ${b.status} → ${dto.status}`);
    }

    const oldStatus = b.status;
    const patch: Partial<Booking> = { status: dto.status };

    if (dto.status === BookingStatus.CONFIRMED && !b.confirmedAt) {
      patch.confirmedAt = new Date();
    }
    if (dto.status === BookingStatus.CANCELLED) {
      patch.cancelledAt        = new Date();
      patch.cancellationReason = dto.reason ?? 'Admin huỷ';
    }

    await this.bookingRepo.update(id, patch);

    // ── Log ──────────────────────────────────────────────────────────────
    const logText = dto.status === BookingStatus.CANCELLED
      ? `[Admin] Huỷ lịch — Lý do: ${patch.cancellationReason}`
      : `[Admin] Đổi trạng thái: ${oldStatus} → ${dto.status}`;
    await this.addLog(id, logText, 'admin_status');

    this.logger.log(`[STATUS] booking=${id} ${oldStatus} → ${dto.status}`);
    return { message: 'Cập nhật trạng thái thành công.', status: dto.status };
  }

  /**
   * Đổi giờ / ngày nhanh từ detail panel.
   *
   * Log ghi: "[Admin] Đổi lịch: 2026-06-02 09:00→10:30 — Lý do: ..."
   * Color:   admin_reschedule (tím)
   */
  async reschedule(id: number, dto: RescheduleBookingDto) {
    const b = await this.bookingRepo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Booking #${id} không tồn tại.`);

    if ([BookingStatus.DONE, BookingStatus.CANCELLED, BookingStatus.EXPIRED].includes(b.status)) {
      throw new BadRequestException('Không thể đổi giờ cho lịch đã hoàn tất / huỷ / hết hạn.');
    }

    const newEnd = calcEndTime(dto.newStartTime, b.totalDuration);

    // Kiểm tra xung đột slot
    const conflict = await this.bookingRepo
      .createQueryBuilder('b2')
      .where('b2.barberId = :bid',      { bid: b.barberId })
      .andWhere('b2.bookingDate = :d',  { d: dto.bookingDate })
      .andWhere('b2.id != :id',         { id })
      .andWhere('b2.status IN (:...active)', {
        active: [BookingStatus.PENDING, BookingStatus.OTP_VERIFIED, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS],
      })
      .andWhere('b2.slotStartTime < :end',   { end: newEnd })
      .andWhere('b2.slotEndTime   > :start', { start: dto.newStartTime })
      .getOne();

    if (conflict) {
      throw new BadRequestException(
        `Barber đã có lịch #${conflict.bookingCode ?? conflict.id} lúc ${conflict.slotStartTime}–${conflict.slotEndTime} ngày này.`,
      );
    }

    // Snapshot giá trị cũ để log
    const oldDate  = b.bookingDate;
    const oldStart = b.slotStartTime;

    await this.bookingRepo.update(id, {
      bookingDate:   dto.bookingDate,
      slotStartTime: dto.newStartTime,
      slotEndTime:   newEnd,
      editedAt:      new Date(),
      editReason:    dto.reason ?? 'Admin đổi giờ',
    });

    // ── Log ──────────────────────────────────────────────────────────────
    const dateChanged  = oldDate !== dto.bookingDate;
    const changeLabel  = dateChanged
      ? `${oldDate} ${oldStart} → ${dto.bookingDate} ${dto.newStartTime}`
      : `${oldStart} → ${dto.newStartTime} (${dto.bookingDate})`;
    const reasonPart   = dto.reason ? ` — Lý do: ${dto.reason}` : '';
    await this.addLog(id, `[Admin] Đổi lịch: ${changeLabel}${reasonPart}`, 'admin_reschedule');

    this.logger.log(`[RESCHEDULE] booking=${id} → ${dto.bookingDate} ${dto.newStartTime}`);
    return { message: 'Đổi lịch thành công.', newDate: dto.bookingDate, newStartTime: dto.newStartTime, newEndTime: newEnd };
  }

  /**
   * Lưu / cập nhật ghi chú.
   *
   * Log ghi: "[Admin] Cập nhật ghi chú" (không log nội dung để tránh PII)
   * Color:   admin_note (xanh dương)
   */
  async updateNote(id: number, dto: UpdateBookingNoteDto) {
    const b = await this.bookingRepo.findOne({ where: { id }, select: ['id', 'note'] });
    if (!b) throw new NotFoundException(`Booking #${id} không tồn tại.`);

    // Chỉ ghi log và update nếu nội dung thực sự thay đổi
    if (b.note === dto.note) {
      return { message: 'Nội dung ghi chú không thay đổi.' };
    }

    await this.bookingRepo.update(id, { note: dto.note });

    // ── Log ──────────────────────────────────────────────────────────────
    // Không lưu nội dung note vào log để tránh expose PII trong audit trail
    await this.addLog(id, '[Admin] Cập nhật ghi chú', 'admin_note');

    return { message: 'Lưu ghi chú thành công.' };
  }

  /**
   * Bulk confirm / cancel nhiều lịch.
   *
   * Log: ghi cho từng booking bị ảnh hưởng.
   * Color: admin_bulk (cam)
   */
  async bulkUpdateStatus(dto: BulkUpdateStatusDto) {
    const bookings = await this.bookingRepo.findBy({ id: In(dto.ids) });
    const eligible = bookings.filter(b =>
      VALID_TRANSITIONS[b.status].includes(dto.status) ||
      [BookingStatus.CONFIRMED, BookingStatus.CANCELLED].includes(dto.status),
    );

    if (!eligible.length) {
      throw new BadRequestException('Không có lịch hẹn nào hợp lệ để cập nhật.');
    }

    const eligibleIds = eligible.map(b => b.id);
    const patch: Partial<Booking> = { status: dto.status };
    if (dto.status === BookingStatus.CONFIRMED) patch.confirmedAt = new Date();
    if (dto.status === BookingStatus.CANCELLED) {
      patch.cancelledAt        = new Date();
      patch.cancellationReason = 'Admin bulk cancel';
    }

    await this.bookingRepo
      .createQueryBuilder()
      .update(Booking)
      .set(patch)
      .whereInIds(eligibleIds)
      .execute();

    // ── Log: ghi cho từng booking riêng biệt (parallel) ──────────────────
    const logText = dto.status === BookingStatus.CANCELLED
      ? `[Admin] Bulk cancel — ${eligibleIds.length} lịch cùng lúc`
      : `[Admin] Bulk confirm — ${eligibleIds.length} lịch cùng lúc`;

    await Promise.allSettled(
      eligibleIds.map(bid => this.addLog(bid, logText, 'admin_bulk')),
    );

    this.logger.log(`[BULK_STATUS] ids=[${eligibleIds.join(',')}] → ${dto.status}`);
    return {
      message: `Đã cập nhật ${eligibleIds.length} lịch hẹn.`,
      updated: eligibleIds.length,
      skipped: dto.ids.length - eligibleIds.length,
    };
  }

  /**
   * Xóa cứng booking.
   *
   * Log: ghi TRƯỚC khi xóa (vì sau khi xóa entity không còn).
   * Color: admin_delete (đỏ)
   */
  async remove(id: number) {
    const b = await this.bookingRepo.findOne({
      where: { id },
      select: ['id', 'status', 'bookingCode', 'customerName', 'bookingDate', 'slotStartTime'],
    });
    if (!b) throw new NotFoundException(`Booking #${id} không tồn tại.`);

    if ([BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS].includes(b.status)) {
      throw new BadRequestException('Không thể xoá lịch đang xác nhận hoặc đang thực hiện.');
    }

    // ── Log TRƯỚC khi xóa để còn ghi vào DB ──────────────────────────────
    await this.addLog(
      id,
      `[Admin] Xóa lịch hẹn — ${b.bookingCode ?? `#${id}`} · ${b.customerName} · ${b.bookingDate} ${b.slotStartTime}`,
      'admin_delete',
    );

    await this.bookingRepo.delete(id);
    this.logger.warn(`[DELETE] booking=${id} code=${b.bookingCode}`);
  }
}