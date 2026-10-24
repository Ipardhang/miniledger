import { config } from './config';
import { HttpError } from './errors';

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  if (config.mockOtp) {
    console.log(JSON.stringify({
      level: 'info',
      event: 'otp.dev',
      phone: phone.replace(/(?<=^..).*(?=....$)/, '***'),
      message: 'OTP available in development logs',
    }));
    return;
  }

  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error('Twilio is not configured');
  }

  const params = new URLSearchParams({
    To: phone,
    Body: `Your MiniLedger verification code is ${code}. It expires in 5 minutes.`,
  });

  if (config.twilioMessagingServiceSid) {
    params.set('MessagingServiceSid', config.twilioMessagingServiceSid);
  } else if (config.twilioFromNumber) {
    params.set('From', config.twilioFromNumber);
  } else {
    throw new Error('Configure TWILIO_MESSAGING_SERVICE_SID or TWILIO_FROM_NUMBER');
  }

  const auth = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
  ).toString('base64');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new HttpError(502, 'Could not send the verification SMS');
  }
}
