import { DelayedJobKeys } from './delayed-job.keys.js';

export interface DelayedJobRegistry {
  [DelayedJobKeys.user.delete]: { userId: string };
  [DelayedJobKeys.user.cleanup]: { userId: string };

  [DelayedJobKeys.invitation.expire]: {
    invitationId: string;
  };

  [DelayedJobKeys.ticket.revoke]: {
    ticketId: string;
  };
}
