import { CanActivate, ExecutionContext, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from '../config';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** So sánh hằng thời gian (băm trước để hai chuỗi luôn cùng độ dài) — không lộ key qua thời gian phản hồi. */
export function apiKeyMatches(header: string | undefined, key: string): boolean {
  if (!key || !header) return false;
  const m = /^Apikey\s+(.+)$/i.exec(header.trim());
  if (!m) return false;
  return timingSafeEqual(digest(m[1].trim()), digest(key));
}

/**
 * Webhook SePay là route công khai (SePay không có phiên đăng nhập) nên tự xác thực bằng
 * header `Authorization: Apikey <SEPAY_WEBHOOK_KEY>` — chọn kiểu "API Key" ở bước Bảo mật khi tạo webhook.
 */
@Injectable()
export class SepayApiKeyGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (!config.sepay.webhookKey) {
      throw new ServiceUnavailableException({ error: 'Chưa cấu hình SEPAY_WEBHOOK_KEY — webhook đang tắt' });
    }
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!apiKeyMatches(req.headers.authorization, config.sepay.webhookKey)) {
      throw new UnauthorizedException({ error: 'API key không hợp lệ' });
    }
    return true;
  }
}
