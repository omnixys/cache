export const DelayedJobKeys = {
  user: {
    delete: 'user.delete',
    cleanup: 'user.cleanup',
  },

  invitation: {
    expire: 'invitation.expire',
  },

  ticket: {
    revoke: 'ticket.revoke',
  },
} as const;
