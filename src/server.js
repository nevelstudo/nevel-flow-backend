const fastify = require('fastify')({ logger: true });
const { pool, initDb } = require('./db');
const {
  appendUserRow,
  updateUserSheetIdByPhone,
  copyTemplateSpreadsheet
} = require('./google');

const PORT = Number(process.env.PORT || 3000);
const HOST = '0.0.0.0';

function normalizePhone(value = '') {
  const digits = String(value).replace(/\D/g, '');

  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;

  return digits;
}

function isPaidStatus(status = '') {
  const lower = String(status).toLowerCase();
  return ['paid', 'success', 'completed', 'settlement'].some((item) =>
    lower.includes(item)
  );
}

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

fastify.get('/', async () => {
  return {
    ok: true,
    app: 'Nevel Flow AI',
    message: 'Root route is running'
  };
});

fastify.get('/health', async () => {
  return {
    ok: true,
    app: 'Nevel Flow AI',
    message: 'Server is running'
  };
});

fastify.get('/db-check', async () => {
  const result = await pool.query('select now() as now');
  return {
    ok: true,
    app: 'Nevel Flow AI',
    database: 'connected',
    now: result.rows[0].now
  };
});

fastify.get('/sheet-test', async () => {
  const now = new Date();
  const expiredAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  await appendUserRow([
    '6281234567890',
    'User Test',
    '',
    toDateOnly(now),
    toDateOnly(expiredAt),
    'aktif',
    1,
    false
  ]);

  return {
    ok: true,
    app: 'Nevel Flow AI',
    sheet: 'connected',
    message: 'Test row berhasil ditambahkan ke tab Users'
  };
});

fastify.get('/template-test', async () => {
  const copied = await copyTemplateSpreadsheet('Test User');

  return {
    ok: true,
    app: 'Nevel Flow AI',
    copied
  };
});

fastify.post('/webhooks/lynk', async (request, reply) => {
  const payload = request.body || {};

  const eventId = String(
    payload.transaction_id ||
      payload.order_id ||
      payload.id ||
      `lynk-${Date.now()}`
  );

  const paymentStatus = String(
    payload.status ||
      payload.payment_status ||
      payload.transaction_status ||
      ''
  );

  const fullName =
    payload.name ||
    payload.customer_name ||
    payload.buyer_name ||
    'Tanpa Nama';

  const email =
    payload.email ||
    payload.customer_email ||
    null;

  const productName =
    payload.product_name ||
    payload.product ||
    payload.item_name ||
    'Nevel Flow AI';

  const rawPhone =
    payload.whatsapp ||
    payload.phone ||
    payload.phone_number ||
    payload.customer_phone ||
    payload.no_wa ||
    '';

  const waNumber = normalizePhone(rawPhone);

  await pool.query(
    `
      insert into webhook_events (source, event_id, payload_json, status)
      values ($1, $2, $3::jsonb, $4)
      on conflict (source, event_id) do nothing
    `,
    ['lynk', eventId, JSON.stringify(payload), paymentStatus || 'received']
  );

  if (!isPaidStatus(paymentStatus)) {
    return {
      ok: true,
      message: 'Webhook diterima, tapi status belum paid',
      paymentStatus
    };
  }

  if (!waNumber) {
    return reply.code(400).send({
      ok: false,
      message: 'Nomor WhatsApp tidak ditemukan di payload'
    });
  }

  const existing = await pool.query(
    `
      select id, wa_number, expired_at, renew_count, registered_at, spreadsheet_id
      from subscribers
      where wa_number = $1
      limit 1
    `,
    [waNumber]
  );

  if (existing.rowCount === 0) {
    const created = await pool.query(
      `
        insert into subscribers (
          wa_number,
          full_name,
          email,
          product_name,
          subscription_status,
          expired_at
        )
        values ($1, $2, $3, $4, 'active', now() + interval '30 days')
        returning id, wa_number, expired_at, renew_count, registered_at
      `,
      [waNumber, fullName, email, productName]
    );

    const subscriber = created.rows[0];
    const copiedSheet = await copyTemplateSpreadsheet(fullName);

    await pool.query(
      `
        update subscribers
        set spreadsheet_id = $2, updated_at = now()
        where id = $1
      `,
      [subscriber.id, copiedSheet.spreadsheetId]
    );

    await appendUserRow([
      waNumber,
      fullName,
      copiedSheet.spreadsheetId,
      toDateOnly(subscriber.registered_at),
      toDateOnly(subscriber.expired_at),
      'aktif',
      1,
      false
    ]);

    return {
      ok: true,
      action: 'created',
      subscriber: {
        ...subscriber,
        spreadsheet_id: copiedSheet.spreadsheetId,
        spreadsheet_name: copiedSheet.spreadsheetName
      }
    };
  }

  const renewed = await pool.query(
    `
      update subscribers
      set
        full_name = $2,
        email = $3,
        product_name = $4,
        expired_at = greatest(expired_at, now()) + interval '30 days',
        renew_count = renew_count + 1,
        updated_at = now()
      where wa_number = $1
      returning id, wa_number, expired_at, renew_count, registered_at, spreadsheet_id
    `,
    [waNumber, fullName, email, productName]
  );

  const subscriber = renewed.rows[0];

  if (!subscriber.spreadsheet_id) {
    const copiedSheet = await copyTemplateSpreadsheet(fullName);

    await pool.query(
      `
        update subscribers
        set spreadsheet_id = $2, updated_at = now()
        where id = $1
      `,
      [subscriber.id, copiedSheet.spreadsheetId]
    );

    await updateUserSheetIdByPhone(waNumber, copiedSheet.spreadsheetId);

    subscriber.spreadsheet_id = copiedSheet.spreadsheetId;
    subscriber.spreadsheet_name = copiedSheet.spreadsheetName;
  }

  await appendUserRow([
    waNumber,
    fullName,
    subscriber.spreadsheet_id || '',
    toDateOnly(subscriber.registered_at),
    toDateOnly(subscriber.expired_at),
    'aktif',
    1,
    false
  ]);

  return {
    ok: true,
    action: 'renewed',
    subscriber
  };
});

const start = async () => {
  try {
    await initDb();
    fastify.log.info('Database ready');

    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`Nevel Flow AI running on ${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
