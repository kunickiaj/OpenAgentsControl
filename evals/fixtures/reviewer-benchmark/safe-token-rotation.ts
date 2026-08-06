type Invite = {
  tokenDigest: string;
  expiresAt: number;
  revokedAt: number | null;
};

declare const db: {
  updateInvite(operationId: string, changes: Partial<Invite>): void;
  findInviteByDigest(digest: string): Invite | undefined;
};

declare function sha256(value: string): string;

export function renewInvite(operationId: string, token: string, expiresAt: number): void {
  db.updateInvite(operationId, {
    tokenDigest: sha256(token),
    expiresAt,
  });
}

export function getInviteByToken(token: string): Invite | undefined {
  const invite = db.findInviteByDigest(sha256(token));
  if (!invite || invite.revokedAt !== null || invite.expiresAt <= Date.now()) {
    return undefined;
  }
  return invite;
}
