import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Combo } from './entities/combo.entity';
import { Service } from '../services/entities/service.entity';
import { CombosService } from './combos.service';
import { CombosController } from './combos.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Combo,Service])],
  controllers: [CombosController],
  providers: [CombosService],
})
export class CombosModule {}
