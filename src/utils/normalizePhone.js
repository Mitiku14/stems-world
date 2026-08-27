const E164_PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const ETHIOPIA_COUNTRY_CODE = '251';
const ETHIOPIA_LOCAL_PHONE_REGEX = /^0[1-9]\d{8}$/;

const invalidPhone = () => new TypeError(
  'Phone must be an Ethiopian local number beginning with 0 or a valid international number beginning with +'
);

const normalizePhone = (value) => {
  if (typeof value !== 'string') throw invalidPhone();

  const input = value.trim();
  if (!input || !/^[+\d\s-]+$/.test(input)) throw invalidPhone();

  let normalized;
  if (input.startsWith('+')) {
    normalized = `+${input.slice(1).replace(/[\s-]/g, '')}`;
  } else if (input.startsWith('0')) {
    const local = input.replace(/[\s-]/g, '');
    if (!ETHIOPIA_LOCAL_PHONE_REGEX.test(local)) throw invalidPhone();
    normalized = `+${ETHIOPIA_COUNTRY_CODE}${local.slice(1)}`;
  } else {
    throw invalidPhone();
  }

  if (!E164_PHONE_REGEX.test(normalized)) throw invalidPhone();
  return normalized;
};

module.exports = normalizePhone;
module.exports.E164_PHONE_REGEX = E164_PHONE_REGEX;
module.exports.ETHIOPIA_COUNTRY_CODE = ETHIOPIA_COUNTRY_CODE;
