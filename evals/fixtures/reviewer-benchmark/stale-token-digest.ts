type Invite = {
  token: string;
  tokenDigest: string;
  expiresAt: number;
  revokedAt: number | null;
};

declare const db: {
  updateInvite(operationId: string, changes: Partial<Invite>): void;
  findInvite(predicate: (invite: Invite) => boolean): Invite | undefined;
};

declare function sha256(value: string): string;

export function renewInvite(operationId: string, token: string, expiresAt: number): void {
  db.updateInvite(operationId, {
    token,
    expiresAt,
    revokedAt: null,
  });
}

export function getInviteByToken(token: string): Invite | undefined {
  const digest = sha256(token);
  return db.findInvite(
    invite =>
      invite.revokedAt === null &&
      invite.expiresAt > Date.now() &&
      (invite.tokenDigest === digest || invite.token === token)
  );
}
