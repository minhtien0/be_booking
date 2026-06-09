import { Injectable, ConflictException, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { BarberStatus } from './entities/barber.entity';
import { Repository } from 'typeorm';
import { Barber } from './entities/barber.entity';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';

@Injectable()
export class BarbersService {
  constructor(
    @InjectRepository(Barber)
    private readonly barberRepository: Repository<Barber>,
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
