import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { SepayApiKeyGuard } from './sepay-api-key.guard';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService, SepayApiKeyGuard],
})
export class PaymentsModule {}
