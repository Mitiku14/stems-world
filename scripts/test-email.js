require('dotenv').config();
const nodemailer = require('nodemailer');

const t = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

console.log('Host:', process.env.EMAIL_HOST);
console.log('User:', process.env.EMAIL_USER);
console.log('Pass length:', process.env.EMAIL_PASS?.length);

t.verify()
  .then(() => {
    console.log('✅ SMTP connection verified');
    return t.sendMail({
      from: process.env.EMAIL_FROM,
      to: process.env.EMAIL_USER,
      subject: 'Test — Backend Email Working ✅',
      html: '<h2>Email is working!</h2><p>Your E-Learning backend can send real emails.</p>',
    });
  })
  .then(() => {
    console.log('✅ Test email sent to ' + process.env.EMAIL_USER);
    console.log('→ Check your Gmail inbox now');
    process.exit(0);
  })
  .catch((e) => {
    console.error('❌ FAILED:', e.message);
    process.exit(1);
  });
