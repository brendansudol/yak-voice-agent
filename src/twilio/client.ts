import twilio from "twilio";

import { config } from "../config.js";

export const normalizePhoneNumber = (phoneNumber: string): string => {
  return phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
};

export const makeOutboundCall = async (phoneNumber: string): Promise<string> => {
  const to = normalizePhoneNumber(phoneNumber);

  const client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN, {
    region: "us1",
    edge: "ashburn",
  });

  const call = await client.calls.create({
    to,
    from: config.TWILIO_PHONE_NUMBER,
    url: `${config.TWILIO_PUBLIC_URL}/twiml`,
    record: true,
  });

  return call.sid;
};
