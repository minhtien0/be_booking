import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, UseGuards, HttpStatus } from '@nestjs/common';
import { CombosService } from './combos.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { ComboViewDto } from './dto/combo-view.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
@Controller('combos')
export class CombosController {
  constructor(private readonly combosService: CombosService) { }

  @Get('detail/:slug')
  findDetailCombo(@Param('slug') slug: string) {
    return this.combosService.getComboDetail(slug);
  }

  @Post('')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createComboDto: CreateComboDto) {
    return this.combosService.create(createComboDto);
  }

  @Get('view-list')
  @HttpCode(HttpStatus.OK)
  async getComboList(): Promise<ComboViewDto[]> {
    return await this.combosService.getCombosForView();
  }

  @Get()
  findAll() {
    return this.combosService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.combosService.findOne(+id);
  }

  @Patch(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param('id') id: string, @Body() updateComboDto: UpdateComboDto) {
    return this.combosService.update(+id, updateComboDto);
  }

  @Delete(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param('id') id: string) {
    return this.combosService.remove(+id);
  }
}
