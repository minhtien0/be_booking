import { Test, TestingModule } from '@nestjs/testing';
import { BarbersController } from './barbers.controller';
import { BarbersService } from './barbers.service';

describe('BarbersController', () => {
  let controller: BarbersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BarbersController],
      providers: [BarbersService],
    }).compile();

    controller = module.get<BarbersController>(BarbersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
