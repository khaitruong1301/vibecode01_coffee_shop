import { apiKeyMatches } from './sepay-api-key.guard';

describe('apiKeyMatches — xác thực webhook SePay', () => {
  const KEY = 'sepay-key-0123456789abcdef';

  it('đúng định dạng "Apikey <key>" → khớp (không phân biệt hoa thường tiền tố, bỏ khoảng trắng thừa)', () => {
    expect(apiKeyMatches(`Apikey ${KEY}`, KEY)).toBe(true);
    expect(apiKeyMatches(`APIKEY   ${KEY} `, KEY)).toBe(true);
  });

  it('sai key, sai tiền tố, thiếu header hoặc server chưa đặt key → không khớp', () => {
    expect(apiKeyMatches(`Apikey ${KEY}x`, KEY)).toBe(false);
    expect(apiKeyMatches(`Bearer ${KEY}`, KEY)).toBe(false);
    expect(apiKeyMatches(KEY, KEY)).toBe(false);
    expect(apiKeyMatches(undefined, KEY)).toBe(false);
    expect(apiKeyMatches(`Apikey ${KEY}`, '')).toBe(false);
  });
});
