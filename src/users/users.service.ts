import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { ListUserQueryDto } from './dto/list-user.query.dto';
import { RegisterDto } from '../auth/dto/register.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  findOneByEmail(email: string) {
    return this.userRepository.findOne({
      where: { email },
      select: ['id', 'name', 'email', 'password', 'role', 'status'],
    });
  }

  async create(dto: RegisterDto) {
    const user = this.userRepository.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      phoneNumber: dto.phoneNumber,
      status: 'Active',
      gender: dto.gender,
      role: dto.role ?? 'user',
    });

    return this.userRepository.save(user);
  }

  async list(query: ListUserQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.name',
        'u.email',
        'u.phoneNumber',
        'u.status',
        'u.gender',
        'u.role',
      ]);

    if (query.search) {
      const search = query.search.trim();
      const isPhoneLike = /^[0-9+]+$/.test(search);

      qb.andWhere(
        new Brackets((sqb) => {
          sqb.where('u.name ILIKE :textSearch', { textSearch: `%${search}%` })
            .orWhere('u.email ILIKE :textSearch', { textSearch: `%${search}%` })
            .orWhere('u.role ILIKE :textSearch', { textSearch: `%${search}%` });

          if (isPhoneLike) {
            sqb.orWhere('u.phoneNumber = :phoneExact', { phoneExact: search })
              .orWhere('u.phoneNumber LIKE :phonePrefix', { phonePrefix: `${search}%` });
          }
        }),
      );
    }
    const sortBy = query.sortBy || 'id';
    const sortOrder = query.sortOrder || 'DESC';
    qb.orderBy(`u.${sortBy}`, sortOrder).skip(skip).take(limit + 1);

    const rows = await qb.getMany();
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;

    return {
      data: items,
      meta: {
        page,
        limit,
        hasNext,
        nextPage: hasNext ? page + 1 : null,
      },
    };
  }

  async findOneWithRefreshToken(id: number): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.refresh_token')  
      .where('user.id = :id', { id })
      .getOne();
  }

  // ── Lưu / xoá hashed refresh token ──────────────────────────────────────────
  async updateRefreshToken(userId: number, hashedToken: string | null): Promise<void> {
    await this.userRepository.update(userId, { refresh_token: hashedToken });
  }

}