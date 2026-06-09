import { Test, TestingModule } from '@nestjs/testing';
import { BookinglogsService } from './bookinglogs.service';

describe('BookinglogsService', () => {
  let service: BookinglogsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BookinglogsService],
    }).compile();

    service = module.get<BookinglogsService>(BookinglogsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
