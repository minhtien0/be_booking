import { Injectable, ConflictException, InternalServerErrorException, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'
import slugify from 'slugify';
import { Repository, ILike } from 'typeorm';
import { Service } from './entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PricingCategoryDto, PricingItemDto } from './dto/pricing-category.dto';
const PRICING_CACHE_KEY = 'services:pricing'
const LIST_CACHE_KEY = 'services:list';
export interface FindAllQueryParam {
  search?: string;
  type?: string;     // 'haircut' | 'shaving' | 'facial'
  status?: number;   // 1: active, 0: inactive
  sortBy?: 'name' | 'originalPrice' | 'duration';
  sortOrder?: 'ASC' | 'DESC';
}
@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
    @Inject(CACHE_MANAGER)
    private readonly cache: Cache,
  ) { }

  private async invalidateCaches(): Promise<void> {
    await Promise.all([
      this.cache.del(PRICING_CACHE_KEY),
      this.cache.del(LIST_CACHE_KEY),
    ]);
  }

  async create(createServiceDto: CreateServiceDto): Promise<Service> {
    const slug = slugify(createServiceDto.name, {
      lower: true,
      strict: true,
      locale: 'vi',
    });

    const existedService = await this.serviceRepository.findOne({
      where: [
        { name: createServiceDto.name },
        { slug },
      ],
    });

    if (existedService) {
      throw new ConflictException(
        'Tên dịch vụ hoặc Slug đã tồn tại trong hệ thống',
      );
    }

    try {
      await this.invalidateCaches();

      const service = this.serviceRepository.create({
        ...createServiceDto,
        slug,
      });

      return await this.serviceRepository.save(service);
    } catch (error) {
      throw new InternalServerErrorException(
        'Đã xảy ra lỗi trong quá trình tạo dịch vụ',
      );
    }
  }

  async getPricingSection(): Promise<PricingCategoryDto[]> {
    // 1. Thử lấy từ cache
    const cached = await this.cache.get<PricingCategoryDto[]>(PRICING_CACHE_KEY)
    if (cached) return cached

    // 2. Cache miss → query DB
    try {
      const allServices = await this.serviceRepository.find({
        where: { status: 1 },
      })

      const categoriesMap: Record<string, PricingCategoryDto> = {
        haircut: { id: 'hair-styling', label: 'Hair Styling', items: [] },
        shaving: { id: 'shaving', label: 'Shaving', items: [] },
        facial: { id: 'face-masking', label: 'Face Masking', items: [] },
      }

      allServices.forEach(item => {
        categoriesMap[item.type]?.items.push({
          id: item.id,
          name: item.name,
          price: item.originalPrice,
          currency: 'đ',
          description: item.description,
          duration:item.duration,
        })
      })

      const result = Object.values(categoriesMap)

      // 3. Lưu vào cache
      await this.cache.set(PRICING_CACHE_KEY, result)

      return result
    } catch {
      throw new InternalServerErrorException('Không thể lấy danh sách bảng giá lúc này')
    }
  }

  async findAll(queryParams: FindAllQueryParam): Promise<Service[]> {
    const { search, type, status, sortBy, sortOrder = 'ASC' } = queryParams;

    // Kiểm tra nếu người dùng không truyền bất kỳ param bộ lọc nào -> Thử lấy từ Cache để tối ưu hóa
    const hasParams = search || (type && type !== 'all') || status !== undefined || sortBy;
    if (!hasParams) {
      const cached = await this.cache.get<Service[]>(LIST_CACHE_KEY);
      if (cached) return cached;
    }

    // Khởi tạo QueryBuilder để cộng dồn các điều kiện lọc động
    const queryBuilder = this.serviceRepository.createQueryBuilder('service');

    // Bộ lọc 1: Trạng thái (1: Đang bán, 0: Tạm ẩn)
    if (status !== undefined && status !== null) {
      queryBuilder.andWhere('service.status = :status', { status });
    }

    // Bộ lọc 2: Danh mục loại dịch vụ
    if (type && type !== 'all') {
      queryBuilder.andWhere('service.type = :type', { type });
    }

    // Bộ lọc 3: Tìm kiếm theo Tên dịch vụ (Không phân biệt hoa thường)
    if (search) {
      queryBuilder.andWhere('service.name ILIKE :search', { search: `%${search}%` });
    }

    // Bộ lọc 4: Sắp xếp động theo các cột trên UI
    if (sortBy) {
      const allowedSortFields = {
        name: 'service.name',
        originalPrice: 'service.originalPrice',
        duration: 'service.duration',
      };
      const orderColumn = allowedSortFields[sortBy] || 'service.id';
      queryBuilder.orderBy(orderColumn, sortOrder);
    } else {
      queryBuilder.orderBy('service.id', 'ASC');
    }

    try {
      const services = await queryBuilder.getMany();

      if (!hasParams) {
        await this.cache.set(LIST_CACHE_KEY, services);
      }

      return services;
    } catch (error) {
      throw new InternalServerErrorException('Không thể tải danh sách dịch vụ lúc này');
    }
  }

  async updateService(id: number, dto: UpdateServiceDto): Promise<Service> {
    const service = await this.serviceRepository.findOneBy({ id });
    if (!service) {
      throw new NotFoundException('Không tìm thấy dịch vụ yêu cầu');
    }

    // Kiểm tra trùng lặp Tên hoặc Slug với các bản ghi khác trước khi lưu
    if (dto.name || dto.slug) {
      const conflictConditions: any[] = [];
      if (dto.name) conflictConditions.push({ name: dto.name });
      if (dto.slug) conflictConditions.push({ slug: dto.slug });

      const existed = await this.serviceRepository.findOne({
        where: conflictConditions,
      });

      // Nếu tìm thấy bản ghi trùng tên/slug nhưng ID lại khác bản ghi hiện tại -> Trùng dữ liệu!
      if (existed && existed.id !== id) {
        throw new ConflictException('Tên dịch vụ hoặc Slug này đã được sử dụng bởi dịch vụ khác');
      }
    }

    try {
      await this.serviceRepository.update(id, dto);
      await this.invalidateCaches(); // Xóa cache cũ để cập nhật dữ liệu mới lên UI khách hàng & admin
      return await this.serviceRepository.findOneByOrFail({ id });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      throw new InternalServerErrorException('Đã xảy ra lỗi trong quá trình cập nhật dịch vụ');
    }
  }

  async toggleStatus(id: number, status: number): Promise<Service> {
    const service = await this.serviceRepository.findOneBy({ id });
    if (!service) {
      throw new NotFoundException('Không tìm thấy dịch vụ yêu cầu');
    }

    try {
      await this.serviceRepository.update(id, { status });
      await this.invalidateCaches();
      return await this.serviceRepository.findOneByOrFail({ id });
    } catch (error) {
      throw new InternalServerErrorException('Không thể cập nhật trạng thái dịch vụ');
    }
  }

  async deleteService(id: number):Promise<{ success: boolean; message: string }> {
    const service = await this.serviceRepository.findOneBy({ id });
    if (!service) {
      throw new NotFoundException('Không tìm thấy dịch vụ để xóa');
    }

    try {
      await this.serviceRepository.delete(id);
      await this.invalidateCaches();
      return { success: true, message: 'Xóa dịch vụ thành công' };
    } catch (error) {
      throw new InternalServerErrorException('Không thể xóa dịch vụ này, vui lòng thử lại sau');
    }
  }

  findOne(id: number) {
    return `This action returns a #${id} service`;
  }
}
