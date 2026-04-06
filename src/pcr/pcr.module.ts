import { Module } from '@nestjs/common';
import { PcrController } from './pcr.controller';
import { PcrService } from './pcr.service';

@Module({
  controllers: [PcrController],
  providers: [PcrService],
  exports: [PcrService],
})
export class PcrModule {}
