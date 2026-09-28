const axios = require('axios');
const crypto = require('crypto');

const RAZORPAY_BASE_URL = 'https://api.razorpay.com';
const UPI_ID_REGEX = /^[a-z0-9._-]{2,256}@[a-z0-9._-]{2,64}$/i;

class RazorpayXError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'RazorpayXError';
    this.step = options.step || 'unknown';
    this.statusCode = options.statusCode || null;
    this.details = options.details || null;
    this.ambiguous = Boolean(options.ambiguous);
  }
}

function isRazorpayXConfigured() {
  return Boolean(
    process.env.RAZORPAYX_KEY_ID &&
    process.env.RAZORPAYX_KEY_SECRET &&
    process.env.RAZORPAYX_ACCOUNT_NUMBER,
  );
}

function getRazorpayXAccountNumber() {
  return String(process.env.RAZORPAYX_ACCOUNT_NUMBER || '').trim();
}

function getRazorpayXPayoutPurpose() {
  return String(process.env.RAZORPAYX_PAYOUT_PURPOSE || 'payout').trim() || 'payout';
}

function shouldQueueIfLowBalance() {
  return String(process.env.RAZORPAYX_QUEUE_IF_LOW_BALANCE || 'false').trim().toLowerCase() === 'true';
}

function normalizeUpiId(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidUpiId(value) {
  return UPI_ID_REGEX.test(normalizeUpiId(value));
}

function sanitizeName(value) {
  const sanitized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return sanitized || 'ShiftSure Rider';
}

function sanitizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.slice(-15) || undefined;
}

function sanitizeEmail(value, fallbackTag = 'rider') {
  const candidate = String(value || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
    return candidate.slice(0, 120);
  }

  const safeTag = String(fallbackTag || 'rider').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'rider';
  return `${safeTag}@shiftsure.in`.slice(0, 120);
}

function sanitizeNarration(value) {
  const cleaned = String(value || '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 30) || 'ShiftSure payout';
}

function mapPayoutStatusToWalletStatus(status) {
  switch (String(status || '').trim().toLowerCase()) {
    case 'pending':
      return 'pending';
    case 'queued':
      return 'queued';
    case 'processing':
      return 'processing';
    case 'processed':
      return 'processed';
    case 'reversed':
      return 'reversed';
    case 'cancelled':
      return 'cancelled';
    case 'rejected':
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

function generateIdempotencyKey() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return [
    crypto.randomBytes(4).toString('hex'),
    crypto.randomBytes(2).toString('hex'),
    crypto.randomBytes(2).toString('hex'),
    crypto.randomBytes(2).toString('hex'),
    crypto.randomBytes(6).toString('hex'),
  ].join('-');
}

function verifyWebhookSignature(rawBody, signature, secret) {
  if (!rawBody || !signature || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  const receivedBuffer = Buffer.from(String(signature), 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function buildClient() {
  return axios.create({
    baseURL: RAZORPAY_BASE_URL,
    timeout: 15000,
    auth: {
      username: process.env.RAZORPAYX_KEY_ID,
      password: process.env.RAZORPAYX_KEY_SECRET,
    },
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

async function requestRazorpayX({ method, path, data, headers, step, ambiguousOnNoResponse = false }) {
  try {
    const client = buildClient();
    const response = await client.request({
      method,
      url: path,
      data,
      headers,
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      const providerError = (error.response.data && error.response.data.error) || {};
      throw new RazorpayXError(
        providerError.description || `RazorpayX ${step} failed`,
        {
          step,
          statusCode: error.response.status,
          details: providerError,
          ambiguous: false,
        },
      );
    }

    throw new RazorpayXError(
      `RazorpayX ${step} could not be confirmed. Retry after checking the payout state.`,
      {
        step,
        statusCode: null,
        details: { code: error.code || 'network_error' },
        ambiguous: ambiguousOnNoResponse,
      },
    );
  }
}

async function createContact({ name, phone, email, referenceId, notes }) {
  return requestRazorpayX({
    method: 'post',
    path: '/v1/contacts',
    step: 'create_contact',
    data: {
      name: sanitizeName(name),
      contact: sanitizePhone(phone),
      email: sanitizeEmail(email, referenceId),
      type: 'customer',
      reference_id: String(referenceId || '').slice(0, 40),
      notes,
    },
  });
}

async function createVpaFundAccount({ contactId, upiId }) {
  return requestRazorpayX({
    method: 'post',
    path: '/v1/fund_accounts',
    step: 'create_fund_account',
    data: {
      account_type: 'vpa',
      contact_id: contactId,
      vpa: {
        address: normalizeUpiId(upiId),
      },
    },
  });
}

async function createPayoutToVpa({
  amountPaise,
  fundAccountId,
  referenceId,
  idempotencyKey,
  narration,
  notes,
}) {
  return requestRazorpayX({
    method: 'post',
    path: '/v1/payouts',
    step: 'create_payout',
    ambiguousOnNoResponse: true,
    headers: {
      'X-Payout-Idempotency': idempotencyKey,
    },
    data: {
      account_number: getRazorpayXAccountNumber(),
      fund_account_id: fundAccountId,
      amount: amountPaise,
      currency: 'INR',
      mode: 'UPI',
      purpose: getRazorpayXPayoutPurpose(),
      queue_if_low_balance: shouldQueueIfLowBalance(),
      reference_id: String(referenceId || '').slice(0, 40),
      narration: sanitizeNarration(narration),
      notes,
    },
  });
}

async function fetchPayoutById(payoutId) {
  return requestRazorpayX({
    method: 'get',
    path: `/v1/payouts/${String(payoutId || '').trim()}`,
    step: 'fetch_payout',
  });
}

module.exports = {
  RazorpayXError,
  createContact,
  fetchPayoutById,
  createPayoutToVpa,
  createVpaFundAccount,
  generateIdempotencyKey,
  getRazorpayXAccountNumber,
  isRazorpayXConfigured,
  isValidUpiId,
  mapPayoutStatusToWalletStatus,
  normalizeUpiId,
  sanitizeEmail,
  sanitizeName,
  sanitizePhone,
  verifyWebhookSignature,
};
