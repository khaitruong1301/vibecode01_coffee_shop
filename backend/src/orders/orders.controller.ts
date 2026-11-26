import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.types';
import { Auth, CurrentUser } from '../auth/decorators';
import { IdPipe } from '../common/id.pipe';
import { ApiErrors } from '../common/swagger';
import { CreateOrderDto, ListOrdersQuery, UpdateStatusDto } from './dto/order.dto';
import { OrderDto, OrderListDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('Đơn hàng')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  /** BR04: cần đăng nhập (guard toàn cục) và đúng vai trò — chặn lỗi L1. */
  @Auth('cashier', 'admin')
  @Post()
  @ApiOperation({
    summary: 'Tạo đơn = bấm Thanh toán (UC02, UC04) — Thu ngân, Chủ quán',
    description: [
      'Chỉ gửi `productId`, `size`, `quantity`. Server lấy giá từ DB và tự tính `unitPrice`, `lineTotal`, `total` (BR01, chặn lỗi L3).',
      'Số lượng nguyên 1–50, cùng món nhiều dòng cộng lại ≤ 50 (BR02, chặn lỗi L2); đơn phải có ít nhất một món (BR03); size L +6.000đ (BR05).',
      'Đơn GrabFood / ShopeeFood bắt buộc `partnerCode`.',
      '`paymentMethod: transfer` (UC07, chỉ đơn tại quầy): đơn chờ chuyển khoản, phản hồi có `transfer.qrUrl`; SePay báo đủ tiền thì đơn mới hiện ở quầy pha (BR06).',
    ].join('\n\n'),
  })
  @ApiCreatedResponse({ type: OrderDto })
  @ApiErrors(400)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: AuthUser): Promise<OrderDto> {
    return this.orders.create(dto, user);
  }

  @Auth()
  @Get()
  @ApiOperation({
    summary: 'Danh sách đơn cho màn quầy pha (UC05) / đơn chờ chuyển khoản (UC07)',
    description:
      'Mặc định: đơn đã thanh toán (BR06), thanh toán trước lên trước. `?payment=unpaid`: đơn đang chờ chuyển khoản, mới nhất trước — chỉ Thu ngân, Chủ quán (Pha chế → 403).',
  })
  @ApiOkResponse({ type: OrderListDto })
  @ApiErrors(400, 403)
  list(@Query() q: ListOrdersQuery, @CurrentUser() user: AuthUser): Promise<OrderListDto> {
    if (q.payment === 'unpaid' && user.role === 'barista') {
      throw new ForbiddenException({ error: 'Bạn không có quyền thực hiện thao tác này' });
    }
    return this.orders.list(q.status, q.limit, q.payment);
  }

  @Auth()
  @Get(':code')
  @ApiOperation({ summary: 'Chi tiết đơn theo mã — in hóa đơn (UC03)' })
  @ApiParam({ name: 'code', example: 'CP-000001' })
  @ApiOkResponse({ type: OrderDto })
  @ApiErrors(404)
  findByCode(@Param('code') code: string): Promise<OrderDto> {
    return this.orders.findByCode(code);
  }

  @Auth('cashier', 'admin')
  @Post(':id/pay-cash')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Khách trả tiền mặt thay vì chuyển khoản (UC07) — Thu ngân, Chủ quán',
    description: 'Chỉ cho đơn đang chờ chuyển khoản. Đơn chuyển sang đã thanh toán (tiền mặt) và hiện ở quầy pha. Đơn đã thanh toán → 409.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: OrderDto })
  @ApiErrors(400, 404, 409)
  payCash(@Param('id', IdPipe) id: number, @CurrentUser() user: AuthUser): Promise<OrderDto> {
    return this.orders.payCash(id, user);
  }

  @Auth('barista', 'admin')
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Chuyển trạng thái pha chế (UC05) — Pha chế, Chủ quán',
    description: 'Chỉ đi tới bước kế tiếp: pending → preparing → ready → done. Sai thứ tự, đơn chưa thanh toán (BR06) hoặc người khác vừa cập nhật → 409.',
  })
  @ApiParam({ name: 'id', type: Number, example: 1 })
  @ApiOkResponse({ type: OrderDto })
  @ApiErrors(400, 404, 409)
  updateStatus(@Param('id', IdPipe) id: number, @Body() dto: UpdateStatusDto): Promise<OrderDto> {
    return this.orders.updateStatus(id, dto.status);
  }
}
