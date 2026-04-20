import { describe, expect, it } from 'vitest';
import { exportReadyTemplate } from './templates';

describe('lib/email/templates — exportReadyTemplate', () => {
  it('renders English subject + body', () => {
    const out = exportReadyTemplate({
      locale: 'en',
      recipient_name: 'Sarah',
      job_id: 'j-123',
      app_url: 'https://app.example.com',
    });
    expect(out.subject).toContain('ready');
    expect(out.html).toContain('Hi Sarah');
    expect(out.text).toContain('Hi Sarah');
    expect(out.html).toContain('https://app.example.com/en/admin/exports?job=j-123');
    expect(out.html).toContain('dir="ltr"');
    expect(out.html).toContain('lang="en"');
  });

  it('renders Arabic subject + body with RTL direction', () => {
    const out = exportReadyTemplate({
      locale: 'ar',
      recipient_name: 'محمد',
      job_id: 'j-ar',
      app_url: 'https://app.example.com/',
    });
    expect(out.subject).toMatch(/جاهز/);
    expect(out.html).toContain('مرحباً محمد');
    expect(out.text).toContain('مرحباً محمد');
    expect(out.html).toContain('dir="rtl"');
    expect(out.html).toContain('lang="ar"');
    // Trailing slash on app_url should be normalized.
    expect(out.html).toContain('https://app.example.com/ar/admin/exports?job=j-ar');
    expect(out.html).not.toContain('example.com//ar');
  });

  it('URL-encodes the job id', () => {
    const out = exportReadyTemplate({
      locale: 'en',
      recipient_name: 'X',
      job_id: 'with space/slash',
      app_url: 'https://x',
    });
    expect(out.html).toContain('job=with%20space%2Fslash');
  });
});
