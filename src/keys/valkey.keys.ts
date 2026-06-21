import type { CreatePendingUserDTO } from '@omnixys/shared';

/** Structural subset implemented by Zod and other parse-based schema libraries. */
export interface CacheValueSchema<T> {
  parse(value: unknown): T;
}

export interface ValkeyKeyOptions<T> {
  readonly ttlSeconds?: number;
  /** @deprecated Use ttlSeconds. */
  readonly ttl?: number;
  readonly schema?: CacheValueSchema<T>;
}

export interface ValkeyKeyDefinition<
  T = unknown,
  Prefix extends string = string,
> {
  readonly prefix: Prefix;
  readonly ttlSeconds?: number;
  /** @deprecated Use ttlSeconds. */
  readonly ttl?: number;
  readonly schema?: CacheValueSchema<T>;
  readonly key: (...parts: Array<string | number>) => string;
  /** Type-only invariant marker. */
  readonly __valueType?: (value: T) => T;
}

export type ValkeyKeyValue<K extends ValkeyKeyDefinition<any>> =
  K extends ValkeyKeyDefinition<infer T, string> ? T : never;

export function createKey<T = unknown, const Prefix extends string = string>(
  prefix: Prefix,
  options: ValkeyKeyOptions<T> = {},
): ValkeyKeyDefinition<T, Prefix> {
  const ttlSeconds = options.ttlSeconds ?? options.ttl;
  if (
    ttlSeconds !== undefined &&
    (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0)
  ) {
    throw new RangeError(
      'Valkey key ttlSeconds must be a positive finite number',
    );
  }

  return {
    prefix,
    ttlSeconds,
    ttl: ttlSeconds,
    schema: options.schema,
    key: (...parts: Array<string | number>) =>
      parts.length === 0 ? prefix : `${prefix}:${parts.join(':')}`,
  };
}

export const ValkeyKey = {
  device: createKey('device'),
  ticket: createKey('ticket'),
  pendingContact: createKey<CreatePendingUserDTO>('pending-contact', {
    ttlSeconds: 900,
  }),
  confirmGuest: createKey('confirm-guest'),
  oauthState: createKey('oauth:state'),
  lock: createKey('lock'),
  rateLimit: createKey('rate-limit'),
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
