import { Controller, Get, Post, Put, Body, Patch, Query, Param, Delete, HttpCode, HttpStatus, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { PricingCategoryDto, PricingItemDto } from './dto/pricing-category.dto';
//
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) { }

  @Post()
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get('pricing')
  @HttpCode(HttpStatus.OK)
  async getPricing(): Promise<PricingCategoryDto[]> {
    return await this.servicesService.getPricingSection();
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('type') type?: string,
    @Query('status') status?: string, // Nhận dạng string từ URL query trước
    @Query('sortBy') sortBy?: 'name' | 'originalPrice' | 'duration',
    @Query('sortOrder') sortOrder?: 'ASC' | 'DESC',
  ) {
    // Xử lý chuyển đổi 'status' từ query string thành number (vì mặc định URL param luôn là string)
    let parsedStatus: number | undefined = undefined;
    if (status !== undefined && status !== 'all' && status !== '') {
      parsedStatus = Number(status);
    }
    return this.servicesService.findAll({
      search,
      type,
      status: parsedStatus,
      sortBy,
      sortOrder,
    });
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.findOne(id);
  }

  @Put(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async updateService(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceDto: UpdateServiceDto,
  ) {
    return this.servicesService.updateService(id, updateServiceDto);
  }

  @Patch(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async toggleStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status', ParseIntPipe) status: number,
  ) {
    return this.servicesService.toggleStatus(id, status);
  }

  @Delete(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async deleteService(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.deleteService(id);
  }

}
