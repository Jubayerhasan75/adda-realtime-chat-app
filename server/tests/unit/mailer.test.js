import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMailer, parseSender } from '../../src/providers/mailer.js';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const env = {
  MAIL_TRANSPORT: 'brevo',
  BREVO_API_KEY: 'xkeysib-test-key-that-must-stay-secret',
  MAIL_FROM: 'Adda <no-reply@adda.example>',
};

afterEach(() => vi.unstubAllGlobals());

describe('Brevo email API', () => {
  it('sends the email over HTTPS with the sender name "Adda"', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    await createMailer(env, logger).send({ to: 'nadia@example.com', subject: 'Hi', text: 'Link' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');
    expect(init.headers['api-key']).toBe(env.BREVO_API_KEY);
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: 'Adda', email: 'no-reply@adda.example' },
      to: [{ email: 'nadia@example.com' }],
      subject: 'Hi',
      textContent: 'Link',
    });
  });

  it('reports failures without the API key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ message: 'Sender not valid' }), { status: 400 }),
      ),
    );
    const error = await createMailer(env, logger)
      .send({ to: 'a@b.c', subject: 's', text: 't' })
      .catch((err) => err);
    expect(error.message).toBe('Brevo /smtp/email failed: 400 Sender not valid');
    expect(error.message).not.toContain(env.BREVO_API_KEY);
  });

  it('reads "Name <email>" senders', () => {
    expect(parseSender('Adda <a@b.com>')).toEqual({ name: 'Adda', email: 'a@b.com' });
    expect(parseSender('a@b.com')).toEqual({ email: 'a@b.com' });
  });
});
