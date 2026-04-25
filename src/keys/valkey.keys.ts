import { CreatePendingUserDTO } from "@omnixys/shared";

// export type ValkeyKeyDefinition<T> = {
//   prefix: string;
//   ttl?: number;
//   key: (...parts: Array<string | number>) => string;
// };

// export const createKey = <T>(
//   prefix: string,
//   options?: { ttl?: number },
// ): ValkeyKeyDefinition<T> => ({
//   prefix,
//   ttl: options?.ttl,
//   key: (...parts: Array<string | number>) => {
//     if (parts.length === 0) return prefix;
//     return `${prefix}:${parts.join(':')}`;
//   },
// });




export type ValkeyKeyDefinition = {
  prefix: string;
  key: (...parts: Array<string | number>) => string;
};

export const createKey = <T extends string>(prefix: T) => ({
  prefix,

  key: (...parts: Array<string | number>) => {
    if (parts.length === 0) return prefix;
    return `${prefix}:${parts.join(':')}`;
  },
});


export const ValkeyKey = {
  device: createKey('device'),
  ticket: createKey('ticket'),

  pendingContact: createKey('pending-contact'),
  // pendingContact: createKey<CreatePendingUserDTO>('pending-contact', {
  //   ttl: 900, // 🔥 15 min default
  // }),
  confirmGuest: createKey('confirm-guest'),

  oauthState: createKey('oauth:state'),

  lock: createKey('lock'),
  rateLimit: createKey('rate-limit'),
  // rateLimit: createKey('rate-limit' {ttl: 60 }),
  stream: createKey('stream'),
  invitation: createKey('invitation'),

  seatLock: createKey('seat-lock'),

  signupVerificationAuth: createKey('verification:signup:auth'),
  signupVerificationUser: createKey('verification:signup:user'),
  signupVerificationAddress: createKey('verification:signup:address'),

  guestVerificationAuth: createKey('verification:guest:auth'),
  guestVerificationUser: createKey('verification:guest:user'),
  guestVerificationEvent: createKey('verification:guest:event'),
  guestVerificationSeat: createKey('verification:guest:seat'),
  guestVerificationTicket: createKey('verification:guest:ticket'),

  mfaChallenge: createKey('verification:mfa'),
  rsvpRateLimit: createKey('rsvp:limit'),

  webauthnRegChallenge: createKey('webauthn:reg'),
  webauthnAuthChallenge: createKey('webauthn:auth'),
  webauthnGlobalAuthChallenge: createKey('webauthn:auth'),

  magicLinkToken: createKey('auth:magic'),

  qrReply: createKey('qr:replay'),

  userAutoDelete: createKey('user:auto-delete'),
} as const;
