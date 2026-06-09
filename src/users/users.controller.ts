import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { ListUserQueryDto } from './dto/list-user.query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get()
  @Roles('Admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  findAll(@Query() query: ListUserQueryDto) {
    return this.usersService.list(query);
  }
}