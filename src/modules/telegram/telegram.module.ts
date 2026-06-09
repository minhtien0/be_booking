import { Module }         from '@nestjs/common';
import { ConfigModule }   from '@nestjs/config';
import { TelegramService } from '../../common/telegram/telegram.service';

@Module({
  imports:   [ConfigModule],   // Để inject ConfigService
  providers: [TelegramService],
  exports:   [TelegramService], // Export nếu module khác cần gửi tin nhắn thủ công
})
export class TelegramModule {}