import { Test, TestingModule } from '@nestjs/testing';
import { BookinglogsController } from './bookinglogs.controller';
import { BookinglogsService } from './bookinglogs.service';

describe('BookinglogsController', () => {
  let controller: BookinglogsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BookinglogsController],
      providers: [BookinglogsService],
    }).compile();

    controller = module.get<BookinglogsController>(BookinglogsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
