import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { BarbersService } from './barbers.service';
import { CreateBarberDto } from './dto/create-barber.dto';
import { UpdateBarberDto } from './dto/update-barber.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('barbers')
export class BarbersController {
  constructor(private readonly barbersService: BarbersService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(@Body() createBarberDto: CreateBarberDto) {
    return this.barbersService.create(createBarberDto);
  }

  @Get('list')
  findAll() {
    return this.barbersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.barbersService.findOne(+id);
  }

  @Patch(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(@Param('id') id: string, @Body() updateBarberDto: UpdateBarberDto) {
    return this.barbersService.update(+id, updateBarberDto);
  }

  @Delete(':id')
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(@Param('id') id: string) {
    return this.barbersService.remove(+id);
  }
}
