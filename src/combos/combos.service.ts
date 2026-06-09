import { Injectable, ConflictException, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository, In } from 'typeorm';
import { Combo } from './entities/combo.entity';
import { Service } from '../services/entities/service.entity';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { ComboViewDto } from './dto/combo-view.dto';

@Injectable()
export class CombosService {
  constructor(
    @InjectRepository(Combo)
    private comboRepository: Repository<Combo>,
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
  ) { }

  async getComboDetail(slug: string): Promise<Combo> {
    const combo = await this.comboRepository.findOne({
      where: { slug },
      /* set up trong entities */
      relations: ['services'],
    });

    if (!combo) {
      throw new NotFoundException(`Không tìm thấy combo với slug: ${slug}`);
    }

    return combo;
  }

  async create(createComboDto: CreateComboDto): Promise<Combo> {
    const { slug, name, serviceId, ...comboData } = createComboDto;

    const existedCombo = await this.comboRepository.findOne({
      where: [{ slug }, { name }],
    });

    if (existedCombo) {
      throw new ConflictException(
        'Tên Combo hoặc Slug đã tồn tại',
      );
    }
    if (!serviceId || serviceId.length === 0) {
      throw new BadRequestException('Phải có ít nhất một service');
    }

    // validate service ids tồn tại
    const uniqueServiceIds = [...new Set(serviceId)];

    const services = await this.serviceRepository.find({
      where: { id: In(uniqueServiceIds) },
    });

    if (services.length !== uniqueServiceIds.length) {
      throw new BadRequestException('Có service không tồn tại');
    }

    const combo = this.comboRepository.create({
      slug,
      name,
      services,
      ...comboData,
    });

    return await this.comboRepository.save(combo);
  }

  async getCombosForView(): Promise<ComboViewDto[]> {
    try {
      const combos = await this.comboRepository.find({
        relations: ['services'],
        select: {
          id: true,
          name: true,
          description: true,
          comboPrice: true,
          slug: true,
          services: {
            id: true,
            duration: true,
          }
        },
        order: { id: 'ASC' },
      });

      // Chuyển đổi dữ liệu sang định dạng View của Front-end
      return combos.map((combo) => {
        let iconKey = 'Classic';
        if (combo.slug.includes('gentleman')) iconKey = 'Gentleman';
        if (combo.slug.includes('royal') || combo.comboPrice >= 500000) iconKey = 'Royal';
        if (combo.slug.includes('met-moi') || combo.slug.includes('relax')) iconKey = 'Relax';
        const totalDuration = combo.services?.reduce((sum, service) => {
          return sum + Number(service.duration || 0);
        }, 0) || 0;

        return {
          id: combo.id,
          title: combo.name,
          description: combo.description,
          price: `${combo.comboPrice.toLocaleString('vi-VN')}đ`,
          iconKey: iconKey,
          slug: combo.slug,
          duration: totalDuration,
        };
      });

    } catch (error) {
      throw new InternalServerErrorException('Không thể tải danh sách gói combo lúc này');
    }
  }

  findAll() {
    return `This action returns all combos`;
  }

  findOne(id: number) {
    return `This action returns a #${id} combo`;
  }

  update(id: number, updateComboDto: UpdateComboDto) {
    return `This action updates a #${id} combo`;
  }

  remove(id: number) {
    return `This action removes a #${id} combo`;
  }
}
