import { Injectable, ConflictException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BarberStatus } from './entities/barber.entity';
import { Repository } from 'typeorm';
import { Barber } from './entities/barber.entity';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { BookingsQueryService } from './../bookings/services/bookings-query.service'

@Injectable()
export class BarbersService {
  constructor(
    @InjectRepository(Barber)
    private readonly barberRepository: Repository<Barber>,
    private readonly bookingsServiceQuery: BookingsQueryService,
  ) { }
  async create(createBarberDto: CreateBarberDto): Promise<Barber> {
    const { name } = createBarberDto;
    const existedService = await this.barberRepository.findOne({
      where: { name },
    });
    if (existedService) {
      throw new ConflictException('Tên thợ đã tồn tại trong hệ thống');
    }
    try {
      const newBarber = this.barberRepository.create(createBarberDto);
      return await this.barberRepository.save(newBarber);
    } catch (error) {
      throw new InternalServerErrorException('Đã xảy ra lỗi trong quá trình tạo dịch vụ');
    }
  }

  async findAll() {
    try {
      const allBarber = await this.barberRepository.find({
        where: { status: BarberStatus.ACTIVE },
      });
      return { data: allBarber };
    } catch (error) {
      throw new InternalServerErrorException('Không thể lấy danh sách bảng giá lúc này');
    }
  }

  async getBarberWithMostFreeSlots(date: string): Promise<{
    id: number
    name: string
    role: string
    avatar: string | null
    freeSlots: number
  }> {
    // Lấy tất cả barber active
    const barbers = await this.barberRepository.find({
      where: { status: BarberStatus.ACTIVE },
    })

    if (!barbers.length) {
      throw new NotFoundException('Không có barber nào.')
    }

    // Tính số slot trống cho từng barber song song
    const results = await Promise.all(
      barbers.map(async (barber) => {
        const slots = await this.bookingsServiceQuery.getAvailableSlots(barber.id, date)
        return { barber, freeSlots: slots.length }
      })
    )

    // Lấy barber có nhiều slot trống nhất
    const best = results.reduce((prev, curr) =>
      curr.freeSlots > prev.freeSlots ? curr : prev
    )

    return {
      id: best.barber.id,
      name: best.barber.name,
      role: best.barber.role,
      avatar: best.barber.avatar,
      freeSlots: best.freeSlots,
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} barber`;
  }

  update(id: number, updateBarberDto: UpdateBarberDto) {
    return `This action updates a #${id} barber`;
  }

  remove(id: number) {
    return `This action removes a #${id} barber`;
  }
}
