import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Auth } from '../auth/decorators';
import { ApiErrors } from '../common/swagger';
import { RevenueQuery } from './dto/revenue-query.dto';
import { RevenueReportDto } from './dto/revenue-report.dto';
import { ReportsService } from './reports.service';

@ApiTags('Báo cáo')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Auth('admin')
  @Get('revenue')
  @ApiOperation({
    summary: 'Doanh thu theo khoảng ngày cho dashboard (UC08) — chỉ Chủ quán',
    description: [
      'Chỉ tính đơn **đã thanh toán**, theo thời điểm thanh toán, ngày giờ theo giờ Việt Nam.',
      'Bỏ trống `from`/`to` → 7 ngày gần nhất. Tối đa 366 ngày. Kèm số liệu kỳ trước cùng độ dài để so sánh.',
    ].join('\n\n'),
  })
  @ApiOkResponse({ type: RevenueReportDto })
  @ApiErrors(400)
  revenue(@Query() q: RevenueQuery): Promise<RevenueReportDto> {
    return this.reports.revenue(q);
  }
}
