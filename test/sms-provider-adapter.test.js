require('dotenv').config();
process.env.OTP_SECRET = 'a_very_secret_otp_encryption_key_32_bytes_long!';

const test = require('node:test');
const assert = require('node:assert/strict');

const smsService = require('../src/services/sms.service');
const { registerProvider, maskPhone, logDiagnostic } = require('../src/services/sms/provider.registry');

test('Phase 3A: SMS Provider Adapter Readiness & Error Normalization', async (t) => {
  t.afterEach(() => {
    smsService.resetSender();
  });

  await t.test('1. Disabled SMS returns controlled disabled reason', async () => {
    smsService.resetSender();
    const result = await smsService.send({ to: '+251912345678', message: 'Test message' });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'disabled');
  });

  await t.test('2. Custom test sender injection works and normalizes accepted result', async () => {
    smsService.setSender(async ({ to, message }) => ({
      accepted: true,
      providerMessageId: 'msg_12345',
      status: 'sent',
    }));

    const result = await smsService.send({ to: '+251912345678', message: 'Test message' });
    assert.equal(result.accepted, true);
    assert.equal(result.status, 'sent');
  });

  await t.test('3. Dynamic provider registration and selection works via provider registry', async () => {
    registerProvider('mock_vendor', async ({ to, message }) => ({
      accepted: true,
      providerMessageId: 'mock_9999',
      status: 'queued',
    }));

    smsService.setSender(async ({ to, message }) => {
      const adapter = require('../src/services/sms/provider.registry').getProvider('mock_vendor');
      return adapter({ to, message });
    });

    const result = await smsService.send({ to: '+251912345678', message: 'Test OTP' });
    assert.equal(result.accepted, true);
    assert.equal(result.providerMessageId, 'mock_9999');
  });

  await t.test('4. Provider rejection normalizes cleanly into application failure', async () => {
    smsService.setSender(async () => ({
      accepted: false,
      reason: 'provider-rejected',
      status: 'failed',
    }));

    const result = await smsService.send({ to: '+251912345678', message: 'Test message' });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'provider-rejected');
  });

  await t.test('5. Provider timeout normalizes into ambiguous timeout failure', async () => {
    smsService.setSender(async () => ({
      accepted: false,
      ambiguous: true,
      reason: 'timeout',
    }));

    const result = await smsService.send({ to: '+251912345678', message: 'Test message' });
    assert.equal(result.accepted, false);
    assert.equal(result.ambiguous, true);
    assert.equal(result.reason, 'timeout');
  });

  await t.test('6. maskPhone helper correctly masks destination numbers', async () => {
    assert.equal(maskPhone('+251912345678'), '+251****5678');
    assert.equal(maskPhone('+14155552671'), '+141****2671');
    assert.equal(maskPhone('short'), '****');
  });

  await t.test('7. Safe diagnostic logging format does not leak raw secrets or full OTP payload', async () => {
    let logged = '';
    const originalLog = console.log;
    console.log = (msg) => { logged = msg; };

    logDiagnostic({
      provider: 'mock_vendor',
      to: '+251912345678',
      accepted: true,
      providerMessageId: 'msg_888',
    });

    console.log = originalLog;

    assert.ok(logged.includes('+251****5678'));
    assert.ok(logged.includes('ACCEPTED'));
    assert.ok(!logged.includes('123456'));
    assert.ok(!logged.includes('OTP_SECRET'));
  });
});
