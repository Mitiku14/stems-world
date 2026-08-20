const escapeRegex = (value) => (typeof value === 'string' ? value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '');

module.exports = escapeRegex;
