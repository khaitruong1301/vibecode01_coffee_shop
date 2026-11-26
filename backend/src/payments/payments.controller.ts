import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { Auth, Public } from '../auth/decorators';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { ApiErrors, SEPAY } from '../common/swagger';
import { ListTransactionsQuery } from './dto/list-transactions.dto';
import { BankTransactionListDto, PaymentSettingsDto } from './dto/payment-response.dto';
import { SepayAckDto, SepayWebhookDto } from './dto/sepay-webhook.dto';
import { PaymentsService } from './payments.service';
import { SepayApiKeyGuard } from './sepay-api-key.guard';

@ApiTags('Thanh toán')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Không cần đăng nhập — SePay gọi; tự xác thực bằng API key (SepayApiKeyGuard). */
  @Public()
  @UseGuards(SepayApiKeyGuard)
  @Post('sepay/webhook')
  @HttpCode(200)
  @ApiSecurity(SEPAY)
  @ApiOperation({
    summary: 'Webhook SePay — nhận giao dịch ngân hàng (UC07)',
    description: [
      'Cấu hình trên SePay: URL `<địa chỉ web>/api/payments/sepay/webhook`, loại giao dịch **Tiền vào**, định dạng **JSON**, bảo mật **API Key** = `SEPAY_WEBHOOK_KEY`.',
      'Header bắt buộc: `Authorization: Apikey <SEPAY_WEBHOOK_KEY>`.',
      'Server tìm mã `CF000123` trong `code` / `content`; đơn chuyển khoản nhận đủ tiền (cộng dồn) → đã thanh toán (BR06).',
      'Cùng `id` gửi lại nhiều lần chỉ xử lý một lần. Luôn trả `{ "success": true }` khi đã ghi nhận.',
    ].join('\n\n'),
  })
  @ApiOkResponse({ type: SepayAckDto })
  @ApiErrors(400, 401)
  @ApiServiceUnavailableResponse({ description: 'Chưa cấu hình SEPAY_WEBHOOK_KEY', type: ErrorResponseDto })
  async sepayWebhook(@Body() dto: SepayWebhookDto): Promise<SepayAckDto> {
    await this.payments.handleSepay(dto);
    return { success: true };
  }

  @Auth('cashier', 'admin')
  @Get('transactions')
  @ApiOperation({ summary: 'Giao dịch chuyển khoản SePay đã nhận, mới nhất trước (UC07) — Thu ngân, Chủ quán' })
  @ApiOkResponse({ type: BankTransactionListDto })
  @ApiErrors(400)
  list(@Query() q: ListTransactionsQuery): Promise<BankTransactionListDto> {
    return this.payments.list(q.limit);
  }

  @Auth()
  @Get('settings')
  @ApiOperation({
    summary: 'Cấu hình thanh toán chuyển khoản (UC07)',
    description: 'Có bật chuyển khoản không, tài khoản nhận tiền, webhook đã có API key chưa. Không trả API key.',
  })
  @ApiOkResponse({ type: PaymentSettingsDto })
  settings(): PaymentSettingsDto {
    return this.payments.settings();
  }
}
