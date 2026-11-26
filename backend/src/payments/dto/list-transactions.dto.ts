import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListTransactionsQuery {
  /**
   * Số giao dịch tối đa (mặc định 100)
   * @example 50
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên' })
  @Min(1, { message: 'limit tối thiểu là 1' })
  @Max(500, { message: 'limit tối đa là 500' })
  limit?: number;
}
